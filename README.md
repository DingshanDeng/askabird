# AskABird

> *What would a bird think?*

AskABird is a web app that lets you explore bird biodiversity across Tucson, AZ — and chat with a local bird species about any spot on the map. Drop a proposed construction site and it scores the biodiversity impact, finds safer nearby alternatives, and lets you hear from the bird neighbors directly.

## Features

| Feature | Description |
|---|---|
| Interactive Map | Leaflet map of Tucson with biodiversity, endangered species, and migration heatmap overlays |
| Bird Chat | Click any spot and chat with a local Sonoran bird powered by Google Gemini |
| Construction Impact Scorer | Drop a site, pick a construction type, get a biodiversity safety score (0–1) |
| Safer Alternatives | Scans nearby cells and surfaces lower-impact construction spots |
| Species Picker | Bird chips + searchable combobox using live eBird data for the clicked location |

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Leaflet
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **AI**: Google Gemini (`gemini-2.0-flash`) via OpenAI-compatible streaming API
- **Bird data**: eBird API v2 (falls back to synthetic Sonoran species data)

## Quick Start

```bash
cd app
npm install
npm run dev
# open http://localhost:8080
```

The `.env` file is already configured with the hosted Supabase credentials — no additional setup needed for local development.

## Environment Variables

### Frontend (`app/.env`)
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### Supabase Edge Function secrets
```bash
supabase secrets set GEMINI_API_KEY=your_google_ai_studio_key
supabase secrets set EBIRD_API_KEY=your_ebird_key   # optional
```

Get a Gemini API key at https://aistudio.google.com/apikey

## Architecture

```
┌────────────────────────────────────┐
│  React SPA (Vite, port 8080)       │
│  app/src/           │
│                                    │
│  pages/Index.tsx    — bird chat    │
│  pages/Optimize.tsx — impact score │
│  components/MapView.tsx            │
│  components/BirdChat.tsx           │
└────────────┬───────────────────────┘
             │ Supabase JS client
             ▼
┌────────────────────────────────────┐
│  Supabase Edge Functions (Deno)    │
│  supabase/functions/               │
│                                    │
│  bird-chat          → Gemini API   │
│  analyze-site       → eBird API    │
│  region-biodiversity→ eBird + cache│
│  nearby-birds       → eBird API    │
│  suggest-alternatives              │
└────────────────────────────────────┘
```

## Deploying

### Edge Functions
```bash
supabase functions deploy bird-chat
supabase functions deploy   # all functions
```

### Frontend (AWS — see plan.md for full options)

**Amplify (easiest)**
Connect the repo in Amplify, set build command to `cd app && npm run build`, output dir to `app/dist`, and add the `VITE_SUPABASE_*` env vars.

**S3 + CloudFront**
```bash
npm run build          # dist/
aws s3 sync dist/ s3://your-bucket --delete
# CloudFront: add 403/404 → index.html error page for SPA routing
```

## Data Sources

- [eBird API v2](https://ebird.org/science/use-ebird-data/) — recent bird sightings
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles
- Synthetic Sonoran Desert species data — fallback when eBird is unavailable
