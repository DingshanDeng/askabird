# AskABird — Development Roadmap

## Current state (MVP)

- FastAPI backend with `/predict`, `/optimize`, `/chat`, `/hotspots`, `/species-grid`
- Streamlit frontend: Folium map, construction impact prediction, bird chat (GPT-4o-mini or rule-based)
- Random Forest model trained on eBird sightings (real or synthetic fallback)
- Species diversity heatmap: zoom-adaptive grid, time-period selector (1 month / 3 / 6 / 12)

---

## Planned features

### 1. Historical construction impact wrapper

**Goal:** Correlate *past* construction events with observable changes in bird diversity over time.

- Ingest a dataset of historical construction events (lat/lon, type, date) for the Tucson area
  - Sources: city permit data, OpenStreetMap edit history, satellite change-detection
- For each construction event, compute:
  - Baseline diversity score (grid cell) in the 6–12 months *before* the event
  - Post-construction diversity score at 3 / 6 / 12 months after
  - Delta and trend line
- Expose a timeline slider in the frontend so users can scrub through years and watch the heatmap evolve
- Add a "construction overlay" layer showing historical structures color-coded by age

### 2. Migration vs. resident bird classification

**Goal:** Split species richness into two ecologically distinct signals.

- **Resident species**: present year-round (e.g. Gambel's Quail, Cactus Wren, Gila Woodpecker)
  - More sensitive to permanent habitat loss (buildings, highways)
  - Stable across seasons; changes signal long-term degradation
- **Migratory species**: seasonal visitors passing through or wintering (e.g. warblers, flycatchers)
  - More sensitive to stopover habitat quality and corridor fragmentation
  - Strong seasonal signal; changes indicate loss of staging habitat

**Implementation steps:**
- Add a `bird_type` column (`resident` / `migrant` / `unknown`) to the sightings data
  - Source: eBird taxonomy + eBird species status API, or a static lookup table seeded from Cornell Lab data
- Split the `/species-grid` response into `resident_count` and `migrant_count` per cell
- Frontend: toggle between three heatmap modes — All species / Residents only / Migrants only
- Update the ML model features to use resident vs. migrant richness separately (two targets or two-output model)
- Bird chat: have the LLM identify itself as a resident or migratory species based on context

### 3. Time-series diversity trend chart

**Goal:** Show how diversity in a clicked cell has changed over time, not just a snapshot.

- On cell click, fetch monthly species counts for the past 1–3 years
- Display a sparkline / bar chart below the map
- Overlay construction event markers on the timeline to visualise cause and effect

### 4. eBird extended history (beyond 30-day API limit)

The eBird API's recent-observations endpoint caps at 30 days. For longer windows:

- Apply for eBird Basic Dataset (EBD) access at https://ebird.org/science/use-ebird-data/
- Alternatively, use the eBird Status & Trends API (requires separate credentials) for species occurrence probability maps by week
- Until then, periods > 30 days use synthetic mock data filtered by day-of-year

---

## Data sources to integrate

| Source | Data | Status |
|---|---|---|
| eBird API v2 | Recent sightings (≤30 days), hotspots | Integrated |
| eBird Basic Dataset (EBD) | Full historical sightings | Pending access |
| OpenStreetMap / Overpass | Current infrastructure | Integrated (mock fallback) |
| City of Tucson open data | Building/permit history | Not started |
| USGS NLCD | Land cover change rasters | Not started |
