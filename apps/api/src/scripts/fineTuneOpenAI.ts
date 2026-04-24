/**
 * fineTuneOpenAI.ts
 *
 * Exports all ScanFeedback rows, uploads the JSONL to OpenAI, and kicks off a
 * new fine-tuning job in a single command. Run this from apps/api/.
 *
 * Usage:
 *   npx ts-node src/scripts/fineTuneOpenAI.ts            # full run
 *   npx ts-node src/scripts/fineTuneOpenAI.ts --dry-run  # export only, no upload
 *
 * Required env vars: OPENAI_API_KEY, DATABASE_URL
 *
 * After the job completes (~20-60 min), update the GitHub secret:
 *   OPENAI_TUNED_MODEL_ID=ft:gpt-4o-2024-08-06:betintel-parser:xxxxxxxx
 * then trigger a deploy (push to main or manual workflow dispatch).
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import sharp from 'sharp';

// Resize images to fit within this box before building the JSONL.
// OpenAI vision tiles images in 512px squares; a 1080×2340 screenshot at
// detail:high costs ~1,400 tokens, but at 473×1024 it costs ~425 tokens —
// a ~70% reduction with no meaningful loss of text legibility.
const MAX_IMAGE_PX = 1024;

async function resizeImage(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const resized = await sharp(buffer)
    .resize(MAX_IMAGE_PX, MAX_IMAGE_PX, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  return resized.toString('base64');
}

const prisma = new PrismaClient();

const MIN_EXAMPLES = 10;

// Keep in sync with openaiVisionParser.ts
const SYSTEM_PROMPT = [
  'You are a bet slip parser for a Portuguese sports betting app.',
  'Extract all data from bet slip screenshots and return structured JSON only.',
  'Return official international team names (e.g. "VfB Stuttgart" not "Estugarda", "Inter Milan" not "Inter Milão").',
  'Always set competition to the correct league. Known: VfB Stuttgart, Bayern Munich, Borussia Dortmund, Bayer Leverkusen, RB Leipzig, Eintracht Frankfurt, Wolfsburg, Werder Bremen play in "Bundesliga" (1st div) — NEVER "2. Bundesliga" or "Bundesliga 2".',
  'IMPORTANT: Keep market names and selection descriptions EXACTLY as they appear in the screenshot in Portuguese — do NOT translate them to English.',
  'Each item has its own "result" field: "WON", "LOST", "VOID", or "PENDING".',
  'Process each selection row from TOP to BOTTOM in document order.',
  'For each row, check the coloured circle icon to the LEFT of the team name and the text colour: GREEN ✓ + green text = WON; RED ✗ + red text = LOST; no icon + white/grey text = PENDING.',
  'IMPORTANT: also include a "losingSelections" array at the boletin level with the EXACT team name strings (as written) that appear in RED on the screenshot (e.g. ["SC Braga", "FC Arouca"]). Empty array if no red names.',
  'In a lost accumulator exactly ONE row is red; all others showing green must be WON. Never mark a row LOST just because the overall bet is Perdida.',
].join(' ');

const USER_SCHEMA_TEXT = [
  'Extract all bet slip data. Return JSON only matching this schema:',
  '{"boletins":[{"betDate":"ISO","stake":0.0,"totalOdds":0.0,"potentialReturn":0.0,"status":"PENDING","losingSelections":["team name in red"],',
  '"items":[{"homeTeam":"","awayTeam":"","competition":"","sport":"FOOTBALL","market":"","selection":"","oddValue":0.0,"eventDate":"ISO","result":"PENDING"}]}]}',
  'losingSelections: list exact team name text strings shown in RED on the screenshot. This is the primary signal for identifying the losing leg.',
  'Boletin status must be "WON", "LOST", or "PENDING". Item result must be "WON", "LOST", "VOID", or "PENDING".',
  'market and selection must be in Portuguese exactly as shown — do NOT translate.',
  'sport must be one of: FOOTBALL BASKETBALL TENNIS HANDBALL VOLLEYBALL HOCKEY RUGBY AMERICAN_FOOTBALL BASEBALL OTHER.',
  'If no bets found: {"boletins":[],"error":"reason"}',
].join(' ');

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY is not set.');
    process.exit(1);
  }

  // ── 1. Fetch feedback records ────────────────────────────────────────────────

  console.log('Fetching ScanFeedback records...');
  const rows = await prisma.scanFeedback.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`Found ${rows.length} record(s).`);

  if (rows.length < MIN_EXAMPLES) {
    console.error(
      `Need at least ${MIN_EXAMPLES} examples to fine-tune (have ${rows.length}).\n` +
      'Collect more user corrections via the scan flow and try again.',
    );
    process.exit(1);
  }

  // ── 2. Build JSONL ───────────────────────────────────────────────────────────

  process.stdout.write(`Resizing ${rows.length} images to max ${MAX_IMAGE_PX}px…`);
  const examples = await Promise.all(
    rows.map(async (row: {
      id: string;
      mimeType: string;
      imageBase64: string;
      correctedOutput: unknown;
    }) => {
      const imageBase64 = await resizeImage(row.imageBase64);
      return {
        messages: [
          { role: 'system' as const, content: SYSTEM_PROMPT },
          {
            role: 'user' as const,
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${row.mimeType};base64,${imageBase64}`,
                  detail: 'high',
                },
              },
              { type: 'text', text: USER_SCHEMA_TEXT },
            ],
          },
          { role: 'assistant' as const, content: JSON.stringify(row.correctedOutput) },
        ],
      };
    }),
  );
  console.log(' done');

  const outDir = path.join(process.cwd(), 'training-data');
  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `scan-feedback-${timestamp}.jsonl`);
  fs.writeFileSync(outFile, examples.map((e) => JSON.stringify(e)).join('\n'), 'utf-8');

  const fileSizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ Exported ${examples.length} examples (${fileSizeMB} MB)\n  → ${outFile}`);

  if (dryRun) {
    console.log('\n[dry-run] Stopping before upload. Cost depends on OpenAI token count (~$25/1M training tokens).');
    return;
  }

  // ── 3. Upload to OpenAI ──────────────────────────────────────────────────────

  const openai = new OpenAI({ apiKey });

  console.log('\nUploading to OpenAI...');
  const uploadedFile = await openai.files.create({
    file: fs.createReadStream(outFile),
    purpose: 'fine-tune',
  });
  console.log(`✓ File uploaded: ${uploadedFile.id}`);

  // ── 4. Create fine-tuning job ────────────────────────────────────────────────

  console.log('\nStarting fine-tuning job...');
  const job = await openai.fineTuning.jobs.create({
    training_file: uploadedFile.id,
    model: 'gpt-4o-2024-08-06',
    suffix: 'betintel-parser',
  });

  console.log(`✓ Job created: ${job.id}`);
  console.log(`  Status : ${job.status}`);
  console.log(`  Model  : ${job.model}`);
  console.log(`\nTrack at: https://platform.openai.com/finetune/${job.id}`);

  // ── 5. Save job metadata ─────────────────────────────────────────────────────

  const jobFile = path.join(outDir, `finetune-job-${timestamp}.json`);
  fs.writeFileSync(
    jobFile,
    JSON.stringify(
      { jobId: job.id, trainingFileId: uploadedFile.id, examples: examples.length, startedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(`  Metadata saved to: ${jobFile}`);

  console.log('\nOnce the job completes, update the GitHub secret and redeploy:');
  console.log('  OPENAI_TUNED_MODEL_ID=<ft:... model ID shown on the OpenAI dashboard>');
}

main()
  .catch((err: unknown) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
