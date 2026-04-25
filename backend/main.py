"""
AskABird FastAPI Backend
========================
Endpoints:
  GET  /health
  POST /predict       – biodiversity impact for a lat/lon + construction type
  POST /optimize      – find best sites in a region (lowest impact)
  POST /chat          – LLM chat from a bird's perspective
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import OPENAI_API_KEY, CONSTRUCTION_TYPES, TUCSON_BOUNDS
from backend.ml_model import predict_impact, find_optimal_sites, suggest_offsets, get_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Pre-warming Random Forest model…")
    get_model()
    logger.info("Model ready.")
    yield


app = FastAPI(
    title="AskABird API",
    description="Biodiversity impact prediction and bird-perspective AI chat.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class PredictRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    construction_type: str = Field(..., description="One of the CONSTRUCTION_TYPES")
    day_of_year: int = Field(180, ge=1, le=365)


class PredictResponse(BaseModel):
    baseline_score: float
    impact_score: float
    delta: float
    impact_pct: float
    offsets: List[dict]


class OptimizeRequest(BaseModel):
    min_lat: float = Field(TUCSON_BOUNDS["min_lat"])
    max_lat: float = Field(TUCSON_BOUNDS["max_lat"])
    min_lon: float = Field(TUCSON_BOUNDS["min_lon"])
    max_lon: float = Field(TUCSON_BOUNDS["max_lon"])
    construction_type: str = Field("power_plant")
    grid_size: int = Field(20, ge=5, le=50)
    top_n: int = Field(3, ge=1, le=10)


class OptimizeResponse(BaseModel):
    sites: List[dict]


class ChatRequest(BaseModel):
    lat: float
    lon: float
    construction_type: str
    baseline_score: float
    impact_score: float
    delta: float
    impact_pct: float
    offsets: List[dict]
    user_message: Optional[str] = ""


class ChatResponse(BaseModel):
    bird_response: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    if req.construction_type not in CONSTRUCTION_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"construction_type must be one of {CONSTRUCTION_TYPES}",
        )
    result = predict_impact(req.lat, req.lon, req.construction_type, req.day_of_year)
    offsets = suggest_offsets(result["impact_pct"], req.construction_type)
    return PredictResponse(**result, offsets=offsets)


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest):
    bounds = {
        "min_lat": req.min_lat,
        "max_lat": req.max_lat,
        "min_lon": req.min_lon,
        "max_lon": req.max_lon,
    }
    sites = find_optimal_sites(bounds, req.construction_type, req.grid_size, req.top_n)
    return OptimizeResponse(sites=sites)


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    response_text = await _generate_bird_response(req)
    return ChatResponse(bird_response=response_text)


# ---------------------------------------------------------------------------
# LLM / rule-based bird response
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are a local Sonoran Desert bird speaking directly to a city planner.
You have just experienced the biodiversity impact of a new construction project in your home territory.
Speak in first person, be emotionally expressive but factual, reference the specific impact numbers.
Keep your response to 3-4 sentences. End with a concrete suggestion using the provided offset data."""


async def _generate_bird_response(req: ChatRequest) -> str:
    """Try OpenAI; fall back to a rule-based template."""
    if OPENAI_API_KEY:
        try:
            return await _openai_response(req)
        except Exception as exc:
            logger.warning("OpenAI call failed (%s). Using rule-based fallback.", exc)
    return _rule_based_response(req)


async def _openai_response(req: ChatRequest) -> str:
    user_content = (
        f"A {req.construction_type.replace('_', ' ')} is being planned at "
        f"lat={req.lat:.4f}, lon={req.lon:.4f}.\n"
        f"Baseline biodiversity score: {req.baseline_score:.2f}\n"
        f"Post-construction score: {req.impact_score:.2f}\n"
        f"Change: {req.impact_pct:.1f}%\n"
        f"Top offset suggestion: {req.offsets[0]['name'] if req.offsets else 'none'} "
        f"(can recover {req.offsets[0]['offset_pct']:.1f}% within "
        f"{req.offsets[0]['radius_m']}m)\n"
        f"User says: {req.user_message or 'What do you think?'}"
    )
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                "max_tokens": 200,
                "temperature": 0.8,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def _rule_based_response(req: ChatRequest) -> str:
    pct = abs(req.impact_pct)
    ctype = req.construction_type.replace("_", " ")
    best_offset = req.offsets[0] if req.offsets else None

    if pct < 10:
        severity = "modest"
        emotion = "concerned but hopeful"
    elif pct < 30:
        severity = "significant"
        emotion = "worried"
    else:
        severity = "severe"
        emotion = "deeply alarmed"

    msg = (
        f"*chirp chirp* — I am {emotion}. "
        f"That {ctype} will reduce our local biodiversity stability by {pct:.1f}%, "
        f"dropping our home score from {req.baseline_score:.2f} to {req.impact_score:.2f}. "
        f"The impact is {severity}."
    )

    if best_offset:
        msg += (
            f" However, if you establish a '{best_offset['name']}' within "
            f"{best_offset['radius_m']} metres, we could recover "
            f"{best_offset['offset_pct']:.1f}% of that loss. Please consider it."
        )
    else:
        msg += " Please find a way to offset this loss for future generations."

    return msg
