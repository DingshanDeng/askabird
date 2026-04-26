# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Both services must run simultaneously in separate terminals:

```bash
# Terminal 1 — backend (FastAPI on :8000)
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend (Streamlit on :8501)
streamlit run frontend/app.py
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Copy and edit the env file (all keys are optional — app runs on mock data without them):
```bash
cp .env.example .env
```

There is no test suite. Manual testing is done via the Streamlit UI at http://localhost:8501 or via the FastAPI interactive docs at http://localhost:8000/docs.

## Architecture

The app has two independent processes that communicate over HTTP:

**`frontend/app.py`** — Streamlit single-page app. Renders a Folium map of Tucson, AZ. On map click, it calls `POST /predict` on the backend, then immediately calls `POST /chat` to generate a bird response. Session state (`st.session_state`) holds all UI state: placed markers, optimal sites, chat history, and the running ecological credit score.

**`backend/main.py`** — FastAPI app with three endpoints: `/predict`, `/optimize`, `/chat`. On startup (`lifespan`), it pre-warms the Random Forest model via `get_model()` which is `@lru_cache`-wrapped and trains once per process. The `/chat` endpoint tries OpenAI GPT-4o-mini first and falls back to a rule-based template.

**`backend/ml_model.py`** — Trains a Random Forest on bird sighting data. `predict_impact()` predicts a baseline biodiversity stability score (0–1) for a location, then applies a construction-type multiplier from `CONSTRUCTION_IMPACT` in config. `find_optimal_sites()` grids the Tucson bounding box into cells and returns the least-damaging locations.

**`backend/data_ingestion.py`** — `load_sightings()` fetches from the eBird API when `EBIRD_API_KEY` is set, otherwise falls back to `mock_data.generate_sightings()`. Both functions are `@lru_cache`-wrapped (cache lasts for the process lifetime).

**`backend/config.py`** — All domain constants: `TUCSON_BOUNDS`, `CONSTRUCTION_TYPES`, `CONSTRUCTION_IMPACT` multipliers, and `OFFSET_STRUCTURES` with their ecological recovery weights.

**`backend/mock_data.py`** — Synthetic Tucson power plant locations and helper functions (`_dist_to_points`, `_road_density`, `_building_density`) used as feature generators when real OSM data is unavailable.

## Key Design Decisions

- The ML model is trained from scratch every cold start (takes ~1–2 seconds). There is no model persistence to disk.
- The eBird API is queried for a 30km radius around Tucson center; the response is cached for the process lifetime.
- `stability_score` target is derived synthetically from feature values when not present in the eBird data (see `_enrich_features` in `ml_model.py`).
- The frontend duplicates `CONSTRUCTION_TYPES` and `TUCSON_BOUNDS` from config — these are not imported from the backend.

## Environment Variables

| Variable | Purpose |
|---|---|
| `EBIRD_API_KEY` | eBird API v2 token; omit to use synthetic sightings |
| `OPENAI_API_KEY` | GPT-4o-mini for bird chat; omit for rule-based responses |
| `BACKEND_URL` | FastAPI base URL read by Streamlit (default: `http://localhost:8000`) |
