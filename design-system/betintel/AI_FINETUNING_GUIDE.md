# Fine-Tuning a Dedicated AI Model for BetIntel Scan

## What this achieves

Instead of a general-purpose model guessing from a prompt, you get a model that:
- Was specifically trained on **your** betting slip screenshots
- Knows Betclic Portugal's exact UI layout, fonts, and abbreviations
- Improves continuously as you feed it more corrected examples
- Does not need lengthy prompt instructions — the knowledge is baked in

---

## Overview of the approach

```
Your screenshots  →  Dataset (image + correct JSON)  →  Fine-tune  →  Tuned model endpoint
                          ↑                                                     |
                     User corrections  ←────────────────────────────── App uses it
```

The cycle: every scan the user corrects becomes a new training example. Over time the model needs fewer corrections.

---

## Step 1 — Choose your fine-tuning platform

You have two realistic options given your current stack:

### Option A — Vertex AI (Google) ✅ Recommended
- Same Google Cloud project you already have
- Supports **Gemini 1.5 Flash** multimodal fine-tuning (image input + JSON output)
- Stays within Google's ecosystem (Firebase Auth, same billing account)
- Cost: ~$4 per 1,000 training examples + inference cost

### Option B — OpenAI (GPT-4o mini vision)
- Simpler API, well-documented fine-tuning pipeline
- Supports image + text fine-tuning
- Cost: ~$0.003 per 1,000 training tokens (very cheap)
- Requires switching your `geminiVisionParser.ts` to call OpenAI instead

**Both options are fully documented below.** Steps 1–3 (platform setup, data collection, data export) differ between options. Step 7 (retraining loop) is the same for both.

---

## Step 2 — Set up Vertex AI in your existing Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select your existing project
2. Search for **"Vertex AI"** → click **Enable API** (if not already enabled)
3. Go to **IAM & Admin → Service Accounts**
4. Create a new service account named `betintel-vertex` with role **Vertex AI User**
5. Download the JSON key → save as `vertexai-key.json` in a safe location (not the repo)
6. On your Hetzner VPS, base64-encode it and store as env var:
   ```bash
   base64 -i vertexai-key.json | tr -d '\n'
   # → paste the output as VERTEX_SA_KEY in your .env and GitHub secrets
   ```

---

## Step 3 — Collect training data

This is the most important step. The model is only as good as your examples.

### 3a — Add a feedback collection endpoint to your API

Add this to `apps/api/src/routes/` — a new route that saves scan corrections:

**Endpoint:** `POST /api/boletins/scan-feedback`

**Request body:**
```json
{
  "imageBase64": "...",
  "mimeType": "image/jpeg",
  "aiOutput": { /* what the AI returned */ },
  "correctedOutput": { /* what the user corrected it to */ }
}
```

Store these in a new table `ScanFeedback` in your Prisma schema:

```prisma
model ScanFeedback {
  id               String   @id @default(cuid())
  userId           String
  imageBase64      String   @db.Text
  mimeType         String
  aiOutput         Json
  correctedOutput  Json
  createdAt        DateTime @default(now())
}
```

Run `pnpm prisma migrate dev` after adding this.

### 3b — Add a "Submit Correction" button in the app

In `apps/mobile/app/boletins/import-review.tsx`, after the user edits the AI result, add a "Submeter correção" button that calls `POST /api/boletins/scan-feedback` with the original scan and corrected data.

Make it optional — never block the user's flow. A small text link "Ajudar a melhorar" is enough.

### 3c — Minimum dataset size before fine-tuning

| Quality tier | Examples needed |
|---|---|
| Noticeable improvement | 50–100 |
| Good accuracy | 200–500 |
| Excellent (near-perfect) | 1,000+ |

You can also use **synthetic examples**: take your existing correctly-parsed slips and add them directly to the dataset without user corrections.

---

## Step 4 — Export training data in Vertex AI format

Vertex AI expects a **JSONL file** where each line is one training example:

```jsonl
{"messages": [{"role": "user", "parts": [{"inlineData": {"mimeType": "image/jpeg", "data": "BASE64_IMAGE"}}, {"text": "Extract bet slip data"}]}, {"role": "model", "parts": [{"text": "{\"boletins\":[...]}"}]}]}
```

### Export script

Create `apps/api/src/scripts/exportTrainingData.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function exportTrainingData() {
  const feedback = await prisma.scanFeedback.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const lines = feedback.map(row => {
    const example = {
      messages: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: row.mimeType, data: row.imageBase64 } },
            { text: 'Extract all bet slip data from this image. Return JSON only.' }
          ]
        },
        {
          role: 'model',
          parts: [{ text: JSON.stringify(row.correctedOutput) }]
        }
      ]
    };
    return JSON.stringify(example);
  });

  fs.writeFileSync('training_data.jsonl', lines.join('\n'));
  console.log(`Exported ${lines.length} examples`);
  await prisma.$disconnect();
}

exportTrainingData();
```

Run it:
```bash
cd apps/api
npx ts-node src/scripts/exportTrainingData.ts
```

---

## Step 5 — Upload data and start a fine-tuning job on Vertex AI

### 5a — Upload the JSONL to Google Cloud Storage

```bash
# Install gcloud CLI if you don't have it
# https://cloud.google.com/sdk/docs/install

gcloud auth activate-service-account --key-file=vertexai-key.json
gcloud config set project YOUR_PROJECT_ID

# Create a bucket (once only)
gsutil mb -l europe-west1 gs://betintel-training-data

# Upload your training file
gsutil cp training_data.jsonl gs://betintel-training-data/training_data.jsonl
```

### 5b — Start a supervised fine-tuning job

Go to **Vertex AI Console → Model Garden → Gemini 1.5 Flash → Tune**

Or via CLI:

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "baseModel": "gemini-1.5-flash-002",
    "supervisedTuningSpec": {
      "trainingDatasetUri": "gs://betintel-training-data/training_data.jsonl",
      "validationDatasetUri": "gs://betintel-training-data/validation_data.jsonl"
    },
    "tunedModelDisplayName": "betintel-slip-parser-v1"
  }' \
  "https://aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/europe-west1/tuningJobs"
```

Training takes **1–3 hours** depending on dataset size. You'll get an email when it's done.

### 5c — Note your tuned model endpoint ID

After training, go to **Vertex AI → Model Registry** → find `betintel-slip-parser-v1` → copy the **endpoint ID** (format: `projects/PROJECT/locations/REGION/endpoints/ENDPOINT_ID`)

---

## Step 6 — Integrate the tuned model into your app

### 6a — Install the Vertex AI SDK

```bash
cd apps/api
pnpm add @google-cloud/vertexai
```

### 6b — Create a new parser that uses the tuned model

Create `apps/api/src/services/vertexVisionParser.ts`:

```typescript
import { VertexAI } from '@google-cloud/vertexai';
import { AIParsedResult } from './geminiVisionParser';

const TUNED_ENDPOINT_ID = process.env.VERTEX_TUNED_ENDPOINT_ID!;
const PROJECT_ID = process.env.VERTEX_PROJECT_ID!;
const LOCATION = process.env.VERTEX_LOCATION ?? 'europe-west1';

let vertexAI: VertexAI | null = null;

function getVertexAI(): VertexAI {
  if (!vertexAI) {
    const saKey = JSON.parse(
      Buffer.from(process.env.VERTEX_SA_KEY!, 'base64').toString()
    );
    vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION, googleAuthOptions: { credentials: saKey } });
  }
  return vertexAI;
}

export async function parseImageWithTunedModel(imageBase64: string, mimeType: string): Promise<AIParsedResult> {
  const vertex = getVertexAI();
  const model = vertex.getGenerativeModel({ model: TUNED_ENDPOINT_ID });

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: 'Extract all bet slip data from this image. Return JSON only.' }
      ]
    }]
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  // ... same normalization logic as geminiVisionParser.ts
  return parsed;
}
```

### 6c — Add env vars

```bash
# .env and GitHub secrets
VERTEX_PROJECT_ID=your-google-cloud-project-id
VERTEX_LOCATION=europe-west1
VERTEX_TUNED_ENDPOINT_ID=projects/.../locations/.../endpoints/...
VERTEX_SA_KEY=BASE64_ENCODED_SERVICE_ACCOUNT_JSON
```

### 6d — Feature-flag the switch

In your scan controller, swap to the tuned model only after you've validated it performs better:

```typescript
const useTunedModel = process.env.USE_TUNED_MODEL === 'true';
const result = useTunedModel
  ? await parseImageWithTunedModel(imageBase64, mimeType)
  : await parseImageWithGemini(imageBase64, mimeType);
```

Set `USE_TUNED_MODEL=true` in your VPS `.env` when you're ready.

---

## Step 7 — Retrain continuously (the learning loop)

Set up a monthly retraining schedule:

1. Export all new corrections since last training: `exportTrainingData.ts`
2. Merge with previous training file: `cat old_data.jsonl new_data.jsonl > combined.jsonl`
3. Upload to GCS: `gsutil cp combined.jsonl gs://betintel-training-data/`
4. Start a new tuning job with the new version name `betintel-slip-parser-v2`
5. Run both models in parallel for a week, compare accuracy
6. Switch `VERTEX_TUNED_ENDPOINT_ID` to the new version

Automate this with a GitHub Actions workflow that runs on a schedule.

---

## Timeline estimate (Option A)

| Phase | Time needed |
|---|---|
| Step 1–2: Vertex AI setup | 1–2 hours |
| Step 3: Add feedback endpoint + UI | 3–5 hours dev time |
| Step 4–5: First training (need 50+ examples) | 1–2 weeks of collecting data |
| Step 6: Integration | 2–3 hours |
| First noticeable improvement visible | ~3–4 weeks total |

---

---

# Option B — OpenAI GPT-4o mini (Vision Fine-Tuning)

Use this path if you prefer a simpler setup, lower cost, or want to avoid Google Cloud infrastructure complexity.

---

## B-Step 1 — Create an OpenAI account and get an API key

1. Go to [platform.openai.com]() → sign up or log in
2. Go to **API keys** → **Create new secret key** → name it `betintel-parser`
3. Copy the key — you will only see it once
4. Add it to your `.env` and GitHub secrets:
   ```
   OPENAI_API_KEY=sk-...
   ```
5. Go to **Billing** → add a payment method. Fine-tuning a small dataset costs under $5.

---

## B-Step 2 — Collect training data (same as Option A Step 3)

The data collection process is identical to Option A. Follow **Step 3** above:
- Add the `ScanFeedback` Prisma model
- Add the `POST /api/boletins/scan-feedback` endpoint
- Add the "Ajudar a melhorar" button in the app

Come back here when you have at least **10 examples** (OpenAI's minimum) — though 50+ is recommended for meaningful improvement.

---

## B-Step 3 — Export training data in OpenAI format

OpenAI's fine-tuning format also uses JSONL, but uses a different schema from Vertex AI.

Create `apps/api/src/scripts/exportTrainingDataOpenAI.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function exportTrainingData() {
  const feedback = await prisma.scanFeedback.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const lines = feedback.map(row => {
    const example = {
      messages: [
        {
          role: 'system',
          content: 'You are a bet slip parser. Extract all data from Portuguese betting slip screenshots and return structured JSON only.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${row.mimeType};base64,${row.imageBase64}`,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: 'Extract all bet slip data from this image. Return JSON only.'
            }
          ]
        },
        {
          role: 'assistant',
          content: JSON.stringify(row.correctedOutput)
        }
      ]
    };
    return JSON.stringify(example);
  });

  // OpenAI requires at least 10 examples; split ~10% for validation
  const splitIndex = Math.max(Math.floor(lines.length * 0.9), lines.length - 1);
  const trainingLines = lines.slice(0, splitIndex);
  const validationLines = lines.slice(splitIndex);

  fs.writeFileSync('openai_training.jsonl', trainingLines.join('\n'));
  fs.writeFileSync('openai_validation.jsonl', validationLines.join('\n'));

  console.log(`Training: ${trainingLines.length} examples`);
  console.log(`Validation: ${validationLines.length} examples`);
  await prisma.$disconnect();
}

exportTrainingData();
```

Run it:
```bash
cd apps/api
npx ts-node src/scripts/exportTrainingDataOpenAI.ts
```

---

## B-Step 4 — Validate your JSONL file

OpenAI provides an official validation script. Run it before uploading to catch format errors:

```bash
pip install openai tiktoken
python -c "
import json, sys
with open('openai_training.jsonl') as f:
    for i, line in enumerate(f):
        try:
            obj = json.loads(line)
            assert 'messages' in obj
            print(f'Line {i+1}: OK')
        except Exception as e:
            print(f'Line {i+1}: ERROR — {e}')
            sys.exit(1)
print('All lines valid')
"
```

---

## B-Step 5 — Upload files and start a fine-tuning job

### 5a — Upload training and validation files

```bash
# Install the OpenAI CLI
pip install openai

# Upload training file
openai api files.create \
  --purpose fine-tune \
  --file openai_training.jsonl

# Note the returned file ID, e.g. file-abc123
# Upload validation file (optional but recommended)
openai api files.create \
  --purpose fine-tune \
  --file openai_validation.jsonl
# Note the returned file ID, e.g. file-def456
```

Or via curl:
```bash
curl https://api.openai.com/v1/files \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F purpose="fine-tune" \
  -F file="@openai_training.jsonl"
```

### 5b — Start the fine-tuning job

```bash
curl https://api.openai.com/v1/fine_tuning/jobs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "training_file": "file-abc123",
    "validation_file": "file-def456",
    "model": "gpt-4o-mini-2024-07-18",
    "hyperparameters": {
      "n_epochs": 3
    },
    "suffix": "betintel-parser"
  }'
```

### 5c — Monitor training progress

```bash
# List all fine-tuning jobs
curl https://api.openai.com/v1/fine_tuning/jobs \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check a specific job
curl https://api.openai.com/v1/fine_tuning/jobs/ftjob-abc123 \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

Training takes **15–60 minutes** for small datasets. When status is `succeeded`, note the `fine_tuned_model` value — it looks like `ft:gpt-4o-mini-2024-07-18:betintel-parser:xxxxx`.

You can also monitor at [platform.openai.com/finetune](https://platform.openai.com/finetune).

---

## B-Step 6 — Integrate the tuned model into your app

### 6a — Install the OpenAI SDK

```bash
cd apps/api
pnpm add openai
```

### 6b — Create a new parser file

Create `apps/api/src/services/openaiVisionParser.ts`:

```typescript
import OpenAI from 'openai';
import { AIParsedResult, normalizeParsedResult } from './geminiVisionParser';
import { logger } from '../utils/logger';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('OPENAI_API_KEY not configured'), { statusCode: 500 });
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

const TUNED_MODEL_ID = process.env.OPENAI_TUNED_MODEL_ID!; // ft:gpt-4o-mini-...:betintel-parser:xxxxx

export async function parseImageWithOpenAI(imageBase64: string, mimeType: string): Promise<AIParsedResult> {
  const client = getOpenAI();

  const response = await client.chat.completions.create({
    model: TUNED_MODEL_ID,
    messages: [
      {
        role: 'system',
        content: 'You are a bet slip parser. Extract all data from Portuguese betting slip screenshots and return structured JSON only.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: 'Extract all bet slip data from this image. Return JSON only.'
          }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const text = response.choices[0]?.message?.content ?? '{"boletins":[]}';
  const parsed = JSON.parse(text);

  logger.info('OpenAI tuned model parse complete', {
    model: TUNED_MODEL_ID,
    usage: response.usage,
  });

  return normalizeParsedResult(parsed);
}
```

> **Note:** You will need to export a `normalizeParsedResult` function from `geminiVisionParser.ts` — this is whatever post-processing you already do to clean up the raw JSON into `AIParsedResult`.

### 6c — Add env vars

```bash
# .env and GitHub secrets
OPENAI_API_KEY=sk-...
OPENAI_TUNED_MODEL_ID=ft:gpt-4o-mini-2024-07-18:betintel-parser:xxxxx
```

### 6d — Feature-flag the switch

In your scan controller, choose which parser to use:

```typescript
const parser = process.env.AI_PARSER; // 'gemini' | 'vertex' | 'openai'

let result: AIParsedResult;
if (parser === 'openai') {
  result = await parseImageWithOpenAI(imageBase64, mimeType);
} else if (parser === 'vertex') {
  result = await parseImageWithTunedModel(imageBase64, mimeType);
} else {
  result = await parseImageWithGemini(imageBase64, mimeType);
}
```

Set `AI_PARSER=openai` in your VPS `.env` when ready.

---

## B-Step 7 — Retrain continuously (the learning loop)

1. Keep collecting corrections via the feedback endpoint
2. When you have 50+ new examples, export again: `npx ts-node src/scripts/exportTrainingDataOpenAI.ts`
3. Upload the new file and start a new fine-tuning job pointing to the **previous tuned model** as base:
   ```bash
   curl https://api.openai.com/v1/fine_tuning/jobs \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "training_file": "file-newxxx",
       "model": "ft:gpt-4o-mini-...:betintel-parser:xxxxx",
       "suffix": "betintel-parser-v2"
     }'
   ```
   This continues training from where you left off rather than starting from scratch.
4. Update `OPENAI_TUNED_MODEL_ID` in your VPS `.env` to the new model ID.

---

## Timeline estimate (Option B)

| Phase | Time needed |
|---|---|
| B-Step 1: OpenAI account + API key | 15 minutes |
| B-Step 2: Feedback collection (same as Option A) | 3–5 hours dev time |
| B-Step 3–4: Export + validate | 30 minutes |
| B-Step 5: Upload + train (10+ examples minimum) | 15–60 minutes training time |
| B-Step 6: Integration | 1–2 hours |
| First noticeable improvement visible | ~1–2 weeks total |

Option B is significantly faster to set up and iterate on than Option A, making it the better choice if you want to get started quickly.

---

---

## Shortcut if you want results faster

While you collect real data, use **Gemini 2.5 Flash with thinking enabled** (remove `thinkingBudget: 0`) and add 5–6 few-shot examples directly in the prompt. This gives you most of the accuracy gain with zero infrastructure work, and you can run it in parallel while building the fine-tuning pipeline.
