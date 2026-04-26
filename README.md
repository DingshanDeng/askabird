# AskABird

> *Before we find life in the stars, we should respect and protect the lives in our surrounding.*

AskABird is a bird-centered biodiversity web app built for Tucson and the Sonoran Desert. Two graduate students researching habitable exoplanets noticed a striking irony: while searching for life in the cosmos, rapid urban expansion is erasing the habitable zones of wildlife right outside our window. AskABird applies the same data-driven rigor used for exoplanet research to the birds in our own backyard.

Built at **HackArizona**.

## 🌵 Try it live: [www.askabird.us](https://www.askabird.us)

---

## What It Does

### Ask a Bird (`/`)
Click anywhere on the map to chat — in real time — with a local Sonoran bird species about that spot. The bird speaks in first person, drawing on live eBird sighting data and Google Gemini/Gemma4 AI. Switch species by tapping the bird avatar in the top-left of the chat panel; the top five Sonoran ambassadors are always shown, followed by birds recently sighted near the clicked location via eBird.

### Find a Spot (`/optimize`)
Drop a proposed construction site on the map, choose a construction type, and get a biodiversity safety score (0–1). The score is a weighted composite of three criteria:
- **Listed-species safety** (weight 0.50) — proximity to endangered or sensitive species
- **Migration pressure** (weight 0.30) — flyway position and migratory hotspot distance
- **Biodiversity sensitivity** (weight 0.20) — local species richness vs. regional average

If the site scores below 0.60, the engine surfaces safer nearby alternatives. A local bird then comments on the choice and invites further questions.

### Site Report (`/report`)
After a site analysis, generate a formal AI-written environmental impact guidance report from the bird's perspective. The report includes an executive summary, per-criterion narrative analysis, and 4–6 site-specific mitigation recommendations with estimated score credits. Printable as PDF via the browser. Includes a scope notice acknowledging that birds are one perspective — responsible development must also consider cultural heritage, human neighbors, and community wellbeing.

### Our Story (`/our-story`)
The motivation: why birds, why Tucson, and the biodiversity impact formula behind the scores.

---

## Why Birds? Why Tucson?

Southeastern Arizona sits at one of the most remarkable ecological crossroads on Earth. The **Sky Islands** — mountain ranges rising from the Sonoran Desert — funnel species from the Rocky Mountains, the Sierra Madre, and the Mexican tropics into a single region. Southeastern Arizona records more than **500 bird species**, roughly half of all species found in North America, making it one of the premier birding destinations on the continent.

Birds are also the most commonly encountered wildlife for most people — spotted from a kitchen window, heard on a morning walk. That everyday familiarity makes them a powerful bridge between people and the broader ecosystem. Bird populations are among the most sensitive and well-documented indicators of environmental change.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Map | Leaflet + OpenStreetMap |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| AI | Google Gemini / Gemma4 via `generativelanguage.googleapis.com` |
| Bird data | eBird API v2 (Cornell Lab of Ornithology) |
| Auth & DB | Supabase (Postgres + Auth) |

---

## Running Locally

```bash
cd app
npm install
npm run dev
# open http://localhost:8080
```

The `.env` file is pre-configured with hosted Supabase credentials — no local backend needed for development.

### Edge Functions (optional)

```bash
# Requires Supabase CLI
supabase start
supabase functions serve
```

Set secrets in `app/supabase/functions/.env`:
```
GEMINI_API_KEY=...
GEMINI_MODEL=...        # e.g. gemma-3-27b-it
EBIRD_API_KEY=...       # optional; falls back to synthetic Sonoran data
```

---

## Edge Functions

| Function | Purpose |
|---|---|
| `bird-chat` | Streams Gemini/Gemma4 response as a first-person Sonoran bird |
| `analyze-site` | eBird + weighted biodiversity scoring for a proposed site |
| `region-biodiversity` | 15×15 heatmap grid (biodiversity / endangered / migratory layers) |
| `nearby-birds` | eBird species lookup for a lat/lon (24h cache) |
| `suggest-alternatives` | Scans surrounding area for lower-impact construction sites |
| `generate-report` | Gemini-written formal impact guidance report (JSON) |

---

## Deploying

### Edge Functions
```bash
supabase functions deploy          # all functions
supabase functions deploy bird-chat  # single function
```

### Frontend — AWS Amplify (recommended)
1. Connect the GitHub repo in Amplify.
2. Build command: `cd app && npm run build` · Output dir: `app/dist`
3. Add env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

### Frontend — S3 + CloudFront
```bash
cd app && npm run build
aws s3 sync dist/ s3://your-bucket --delete
# CloudFront: add 403/404 → index.html error page for SPA routing
```

---

## Biodiversity Impact Formula

```
S_impact = f(B, R, D)
```

| Variable | Meaning | Weight |
|---|---|---|
| B | Biodiversity richness (species count vs. regional avg) | 0.20 |
| R | Rare / endangered species proximity | 0.50 |
| D | Migration corridor pressure | 0.30 |

A post-construction score ≥ 0.60 is considered a **good site**. Below 0.60, safer nearby alternatives are surfaced and mitigation recommendations are generated.

---

## Data Sources

- [eBird API v2](https://ebird.org/science/use-ebird-data/) — Cornell Lab of Ornithology
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles
- Synthetic Sonoran Desert species data — fallback when eBird is unavailable

---

## Acknowledgements

Bird data powered by **eBird** · Conversation powered by **Gemini / Gemma4** · Built for the Sonoran Desert.
