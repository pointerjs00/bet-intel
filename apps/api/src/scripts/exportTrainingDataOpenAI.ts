/**
 * exportTrainingDataOpenAI.ts
 *
 * Exports all ScanFeedback rows from the database as an OpenAI fine-tuning JSONL
 * file (one training example per line).
 *
 * Usage:
 *   npx ts-node src/scripts/exportTrainingDataOpenAI.ts
 *
 * Output: training-data/scan-feedback-<timestamp>.jsonl
 *
 * After export, upload the file to OpenAI and start a fine-tuning job:
 *   openai api fine_tuning.jobs.create \
 *     -t training-data/scan-feedback-<timestamp>.jsonl \
 *     -m gpt-4o-mini-2024-07-18
 *
 * Then set OPENAI_TUNED_MODEL_ID on the server to the resulting ft:... model ID
 * and set AI_PARSER=openai to route scans through the tuned model.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_PROMPT = [
  'You are a bet slip parser for a Portuguese sports betting app.',
  'Extract all data from bet slip screenshots and return structured JSON only.',
  'Return official international team names (e.g. "VfB Stuttgart" not "Estugarda", "Inter Milan" not "Inter Milão").',
  'Always set competition to the correct league name (e.g. "Ligue 1", "Premier League", "La Liga").',
].join(' ');

const USER_SCHEMA_TEXT = [
  'Extract all bet slip data. Return JSON only matching this schema:',
  '{"boletins":[{"betDate":"ISO","stake":0.0,"totalOdds":0.0,"potentialReturn":0.0,"status":"PENDING",',
  '"items":[{"homeTeam":"","awayTeam":"","competition":"","sport":"FOOTBALL","market":"","selection":"","oddValue":0.0,"eventDate":"ISO"}]}]}',
  'status must be "WON", "LOST", or "PENDING". sport must be one of: FOOTBALL BASKETBALL TENNIS HANDBALL VOLLEYBALL HOCKEY RUGBY AMERICAN_FOOTBALL BASEBALL OTHER.',
  'If no bets found: {"boletins":[],"error":"reason"}',
].join(' ');

type TrainingExample = {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: string; [key: string]: unknown }>;
  }>;
};

async function main(): Promise<void> {
  console.log('Fetching ScanFeedback records...');

  const rows = await prisma.scanFeedback.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${rows.length} feedback record(s).`);

  if (rows.length === 0) {
    console.log('No training data yet — collect some feedback via the app and try again.');
    return;
  }

  const examples: TrainingExample[] = rows.map((row: {
    id: string;
    userId: string;
    imageBase64: string;
    mimeType: string;
    aiOutput: unknown;
    correctedOutput: unknown;
    createdAt: Date;
  }) => ({
    messages: [
      {
        role: 'system' as const,
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${row.mimeType};base64,${row.imageBase64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: USER_SCHEMA_TEXT,
          },
        ],
      },
      {
        role: 'assistant' as const,
        // correctedOutput is the ground-truth that the model should learn to produce
        content: JSON.stringify(row.correctedOutput),
      },
    ],
  }));

  const outDir = path.join(process.cwd(), 'training-data');
  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `scan-feedback-${timestamp}.jsonl`);

  const jsonl = examples.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(outFile, jsonl, 'utf-8');

  console.log(`\n✓ Exported ${examples.length} example(s) to:\n  ${outFile}`);
  console.log('\nNext steps:');
  console.log('  1. Upload to OpenAI:');
  console.log(`       openai api files.create -f "${outFile}" -p fine-tune`);
  console.log('  2. Start fine-tuning job:');
  console.log('       openai api fine_tuning.jobs.create -t <file-id> -m gpt-4o-mini-2024-07-18');
  console.log('  3. Once the job finishes, copy the ft:... model ID and set:');
  console.log('       OPENAI_TUNED_MODEL_ID=ft:gpt-4o-mini-2024-07-18:...');
  console.log('       AI_PARSER=openai');
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
