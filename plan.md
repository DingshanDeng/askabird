# AskABird — Plan

## Current State

React/Vite/TypeScript single-page app (in `ask_a_bird_lovable/`) backed by Supabase Edge Functions (Deno/TypeScript). The old Python/FastAPI/Streamlit stack is archived.

**Pages:**
- `/` — Ask a Bird: Leaflet map + bird chat sidebar. Click any spot, pick a species, ask it about the location.
- `/optimize` — Construction Plan: drop a proposed structure, score biodiversity impact, get safer alternatives.
- `/our-story` — About page.

**Supabase Edge Functions:**
- `bird-chat` — Streams AI bird persona replies (migrating to Gemini/Gemma4)
- `analyze-site` — eBird + biodiversity scoring for a proposed construction site
- `region-biodiversity` — 15×15 heatmap grid (biodiversity / endangered / migratory layers)
- `nearby-birds` — eBird species lookup for a location
- `suggest-alternatives` — Scans surrounding area for lower-impact construction sites

---

## Step 1 — Gemini/Gemma4 API Integration (Next)

**Goal:** Replace the Lovable AI gateway in `bird-chat` with Google Gemini directly.

### What changes
- `supabase/functions/bird-chat/index.ts`: replace `LOVABLE_API_KEY` + Lovable gateway URL with `GEMINI_API_KEY` + Google's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`).
- Model: `gemini-2.0-flash` by default; override via `GEMINI_MODEL` Supabase secret.
- Frontend (`BirdChat.tsx`) is **unchanged** — the OpenAI streaming format is the same.

### How to activate
1. Get a key at https://aistudio.google.com/apikey
2. Set the secret in Supabase:
   ```bash
   supabase secrets set GEMINI_API_KEY=your_key_here
   # optional: GEMINI_MODEL=gemini-2.0-flash
   ```
3. Deploy the edge function:
   ```bash
   supabase functions deploy bird-chat
   ```

---

## Step 2 — AWS Deployment

**Goal:** Host the static frontend on AWS; keep Supabase as the backend for now.

### Option A — AWS Amplify (simplest)
1. Connect the GitHub repo to Amplify.
2. Set build command: `cd ask_a_bird_lovable && npm run build` and output dir: `ask_a_bird_lovable/dist`.
3. Set env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) in Amplify console.
4. Amplify handles CI/CD, CDN, and custom domain automatically.

### Option B — S3 + CloudFront (standard)
1. Build: `cd ask_a_bird_lovable && npm run build` → output in `dist/`.
2. Upload `dist/` to an S3 bucket (static website hosting enabled).
3. Create a CloudFront distribution pointing at the S3 bucket; set default root object to `index.html`; add a 403/404 → `index.html` error page rule (for SPA routing).
4. Set env vars at build time or bake them into the bundle.

### Option C — Full AWS (future)
Migrate Supabase Edge Functions to AWS Lambda + API Gateway. Use RDS/DynamoDB instead of Supabase Postgres. Use Secrets Manager for API keys. Required only if you need to stay fully within AWS.

---

## Future Features

- **Resident vs. migratory bird split** — separate heatmap modes and ML features
- **Historical construction impact** — timeline slider showing pre/post-construction diversity changes
- **Time-series trend chart** — sparkline of monthly species counts per clicked cell
- **eBird Extended Dataset** — apply for EBD access for >30-day historical windows
- **Auth-gated balance sheet** — save and compare multiple sites across sessions
