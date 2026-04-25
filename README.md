# 🐦 AskABird

> *What would a bird think?*

AskABird is an AI-powered web app that predicts the **biodiversity impact** of
human construction (energy/power plants, roads, buildings) and lets you chat
with an AI from a local bird's perspective.

## Features

| Feature | Description |
|---|---|
| 🗺️ Interactive Map | Click to drop structures on a Folium map of Tucson, AZ |
| 🤖 ML Impact Model | Random Forest predicts biodiversity stability score (0–1) |
| 💬 Bird Chat | LLM (GPT-4o-mini) or rule-based AI responds as a local Sonoran bird |
| 🔍 Site Optimizer | Grids region into 20×20 cells, returns top-3 lowest-impact sites |
| 🌿 Offset Suggestions | Suggests Urban Forest, Wetland Restoration etc. to offset damage |
| 📊 Balance Sheet | Running Ecological Credit score tracks cumulative impact |

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment (optional)

```bash
cp .env.example .env
# Add your EBIRD_API_KEY and OPENAI_API_KEY (both optional – mock data is used when absent)
```

### 3. Start the backend

```bash
uvicorn backend.main:app --reload --port 8000
```

### 4. Start the frontend (new terminal)

```bash
streamlit run frontend/app.py
```

Open http://localhost:8501 in your browser.

## Architecture

```
┌─────────────────────┐       HTTP/REST        ┌───────────────────────┐
│  Streamlit Frontend │ ─────────────────────► │  FastAPI Backend       │
│  frontend/app.py    │                        │  backend/main.py       │
│                     │                        │                        │
│  • Folium map       │ ◄───────────────────── │  /predict              │
│  • Chat sidebar     │   JSON responses       │  /optimize             │
│  • Balance sheet    │                        │  /chat                 │
└─────────────────────┘                        └───────────┬───────────┘
                                                           │
                                               ┌───────────▼───────────┐
                                               │  ML Model              │
                                               │  backend/ml_model.py   │
                                               │  Random Forest         │
                                               └───────────┬───────────┘
                                                           │
                                               ┌───────────▼───────────┐
                                               │  Data Ingestion        │
                                               │  backend/data_ingestion│
                                               │  eBird + OSM (mock)    │
                                               └───────────────────────┘
```

## API Reference

### `POST /predict`
```json
{ "lat": 32.22, "lon": -110.97, "construction_type": "power_plant" }
```
Returns biodiversity stability scores before/after construction + offset suggestions.

### `POST /optimize`
```json
{ "min_lat": 32.05, "max_lat": 32.35, "min_lon": -111.10, "max_lon": -110.75, "construction_type": "power_plant" }
```
Returns the 3 grid cells with the lowest negative impact.

### `POST /chat`
```json
{ "lat": 32.22, "lon": -110.97, "construction_type": "power_plant", "baseline_score": 0.72, "impact_score": 0.41, "delta": -0.31, "impact_pct": -43.1, "offsets": [...], "user_message": "What do you think?" }
```
Returns a bird-perspective narrative response.

## Data Sources

- **Bird sightings**: [eBird API](https://ebird.org/science/use-ebird-data/) (falls back to synthetic data)
- **Infrastructure**: [OpenStreetMap Overpass API](https://overpass-api.de/) (falls back to synthetic data)

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `EBIRD_API_KEY` | eBird API v2 token | mock data used |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o-mini | rule-based responses |
| `BACKEND_URL` | FastAPI server URL | `http://localhost:8000` |
