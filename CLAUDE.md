# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Active Codebase

The live app is in **`app/`** — a React/Vite/TypeScript SPA backed by Supabase Edge Functions.

The old Python/FastAPI/Streamlit stack (`backend/`, `frontend/app.py`) is archived in `archive/`.

---

## Running Locally

```bash
cd app
npm install          # first time only
npm run dev          # Vite dev server at http://localhost:8080
```

The frontend connects to the hosted Supabase project (credentials already in `app/.env`). No local backend process is needed for basic development.

### Running Edge Functions locally (optional)

```bash
# Requires Supabase CLI: https://supabase.com/docs/guides/cli
supabase start
supabase functions serve
```

Set function secrets in `supabase/functions/.env`:
```
GEMINI_API_KEY=...
EBIRD_API_KEY=...
```

---

## Architecture

**`app/src/`** — React SPA (Vite + TypeScript + Tailwind + shadcn/ui)

| File | Purpose |
|---|---|
| `pages/Index.tsx` | Main "Ask a Bird" page: map + bird chat |
| `pages/Optimize.tsx` | Construction planner: drop site, score impact, get alternatives |
| `pages/OurStory.tsx` | About page |
| `components/MapView.tsx` | Leaflet map with biodiversity/endangered/migratory overlays |
| `components/BirdChat.tsx` | Streaming chat UI — calls `bird-chat` Edge Function via SSE |
| `components/BirdCombobox.tsx` | Searchable bird species picker (calls `nearby-birds`) |
| `components/ImpactResult.tsx` | Renders biodiversity impact scores and criteria breakdown |
| `hooks/useRegionBiodiversity.ts` | Fetches 15×15 heatmap grid from `region-biodiversity` |
| `integrations/supabase/client.ts` | Supabase JS client (reads VITE_SUPABASE_* env vars) |

**`app/supabase/functions/`** — Deno/TypeScript Edge Functions

| Function | Purpose |
|---|---|
| `bird-chat` | Streams Gemini response in first-person bird persona |
| `analyze-site` | eBird + biodiversity scoring for a proposed construction site |
| `region-biodiversity` | Returns 15×15 grid of species/endangered/migratory data |
| `nearby-birds` | eBird species lookup for a lat/lon |
| `suggest-alternatives` | Finds lower-impact construction sites nearby |
| `_shared/biodiversity.ts` | Shared constants: sensitive species list, construction profiles, scoring |

---

## Key Design Decisions

- **Streaming chat**: `BirdChat.tsx` reads raw SSE from the `bird-chat` Edge Function and parses OpenAI-format `data:` chunks. Do not change the parse logic without also updating the edge function's response format.
- **Region heatmap debounce**: `useRegionBiodiversity` quantizes lat/lon to 0.1° buckets and debounces map pan events (600 ms in `MapView.tsx`) to avoid spamming the edge function.
- **AI model**: `bird-chat` uses **Gemma 4** via the Google Cloud Gemini API native SSE endpoint (`generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent`). The model is set via the `GEMINI_MODEL` Supabase secret (currently Gemma 4). Note: this uses the **native** Gemini endpoint, not the OpenAI-compatible proxy.
- **eBird fallback**: `analyze-site` falls back to synthetic Sonoran species data when `EBIRD_API_KEY` is absent or eBird returns no results.
- **Auth**: Supabase Auth is wired up (`useAuth`, `pages/Auth.tsx`). The `sites` table requires `user_id` to save. Anonymous users can still explore and analyze.

---

## Environment Variables

### Frontend (`.env` in `app/`)
| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |

### Edge Function secrets (set via `supabase secrets set KEY=value`)
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key — required for bird chat |
| `GEMINI_MODEL` | Model name served via Gemini API (currently Gemma 4) |
| `EBIRD_API_KEY` | eBird API v2 token — optional, falls back to synthetic data |

---

## Deploying Edge Functions

```bash
# Deploy a single function after editing
supabase functions deploy bird-chat

# Deploy all functions
supabase functions deploy
```

## Building for Production

```bash
cd app
npm run build     # output in dist/
```

See `plan.md` for AWS deployment options (Amplify vs S3+CloudFront).

---

## No Test Suite

Manual testing is done via the browser at http://localhost:8080.
