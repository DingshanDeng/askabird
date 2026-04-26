"""
AskABird – Streamlit Frontend
==============================
Layout
------
┌──────────────────────────────────────────────────────────────────────┐
│  Sidebar: controls + chat + balance sheet                            │
│  Main: full-screen Folium map                                        │
└──────────────────────────────────────────────────────────────────────┘
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st
import folium
import branca.colormap as cm
import numpy as np
import pandas as pd
import requests
from streamlit_folium import st_folium

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
SPECIES_GRID_CSV_PATH = Path(__file__).resolve().parents[1] / "backend" / "data" / "species_grid.csv"

CONSTRUCTION_TYPES = {
    "⚡ Power Plant": "power_plant",
    "🏭 Industrial Zone": "industrial",
    "🛣️ Highway": "highway",
    "🏗️ Building": "building",
    "☀️ Solar Farm": "solar_farm",
    "💨 Wind Farm": "wind_farm",
}

CONSTRUCTION_COLORS = {
    "power_plant": "red",
    "industrial": "orange",
    "highway": "gray",
    "building": "blue",
    "solar_farm": "yellow",
    "wind_farm": "lightblue",
}

ARIZONA_CENTER = [34.16, -111.09]
ARIZONA_BOUNDS = [[31.33, -114.82], [37.00, -109.04]]
TUCSON_CENTER = [32.22, -110.97]
TUCSON_BOUNDS = {
    "min_lat": 32.05,
    "max_lat": 32.35,
    "min_lon": -111.10,
    "max_lon": -110.75,
}

# Scales impact_pct (already negative for harm) into ecological credit points.
# e.g. a −42% impact yields −21 credit points.
ECO_CREDIT_MULTIPLIER = 0.5

# Grid search parameters used for site optimisation
OPTIMIZE_GRID_SIZE = 20
OPTIMIZE_TOP_N = 3

# Heatmap display grid: 15×15 cells overlaid on the current viewport.
# Buffer extends the grid beyond the visible edges so light panning keeps cells visible.
HEATMAP_GRID = 15
HEATMAP_BUFFER = 0.5  # fraction of viewport span added on each side

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="AskABird 🐦",
    page_icon="🐦",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Session state initialisation
# ---------------------------------------------------------------------------
def _init_state():
    defaults = {
        "chat_history": [],
        "markers": [],          # list of {lat, lon, ctype, impact_score, delta, impact_pct}
        "optimal_sites": [],    # list of {lat, lon, impact_score}
        "show_species_heatmap": True,
        "species_grid": None,
        "map_bounds": TUCSON_BOUNDS.copy(),
        "map_center": TUCSON_CENTER[:],      # persisted so reruns don't snap the view
        "map_zoom": 11,
        "eco_credit": 100.0,    # running ecological credit score
        "selected_ctype": "power_plant",
        "last_click": None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

_init_state()

# ---------------------------------------------------------------------------
# Helper: call backend
# ---------------------------------------------------------------------------
def _predict(lat: float, lon: float, ctype: str) -> dict | None:
    try:
        r = requests.post(
            f"{BACKEND_URL}/predict",
            json={"lat": lat, "lon": lon, "construction_type": ctype},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        st.sidebar.error(f"Backend error: {e}")
        return None


def _chat(lat: float, lon: float, ctype: str, pred: dict, user_msg: str) -> str | None:
    try:
        r = requests.post(
            f"{BACKEND_URL}/chat",
            json={
                "lat": lat,
                "lon": lon,
                "construction_type": ctype,
                "baseline_score": pred["baseline_score"],
                "impact_score": pred["impact_score"],
                "delta": pred["delta"],
                "impact_pct": pred["impact_pct"],
                "offsets": pred.get("offsets", []),
                "user_message": user_msg,
            },
            timeout=15,
        )
        r.raise_for_status()
        return r.json()["bird_response"]
    except Exception as e:
        st.sidebar.error(f"Chat error: {e}")
        return None


def _fetch_species_grid(bounds: dict | None = None) -> dict | None:
    """Return a HEATMAP_GRID × HEATMAP_GRID display grid over the given viewport.

    Aggregates precomputed Arizona cells into display cells by centroid assignment,
    then returns at most HEATMAP_GRID² rectangles to keep rendering fast.
    The covered area extends HEATMAP_BUFFER × viewport beyond each edge so that
    light panning still shows heatmap tiles without requiring a manual refresh.
    """
    grid_df = _load_species_grid_df()
    if grid_df is None:
        return None

    bounds = bounds or TUCSON_BOUNDS
    lat_span = max(bounds["max_lat"] - bounds["min_lat"], 1e-6)
    lon_span = max(bounds["max_lon"] - bounds["min_lon"], 1e-6)

    buf_lat = HEATMAP_BUFFER * lat_span
    buf_lon = HEATMAP_BUFFER * lon_span
    ext_min_lat = bounds["min_lat"] - buf_lat
    ext_max_lat = bounds["max_lat"] + buf_lat
    ext_min_lon = bounds["min_lon"] - buf_lon
    ext_max_lon = bounds["max_lon"] + buf_lon

    nearby = grid_df.loc[
        (grid_df["max_lat"] > ext_min_lat)
        & (grid_df["min_lat"] < ext_max_lat)
        & (grid_df["max_lon"] > ext_min_lon)
        & (grid_df["min_lon"] < ext_max_lon)
    ].copy()
    if nearby.empty:
        return {"cells": [], "max_species": 1}

    cell_h = (ext_max_lat - ext_min_lat) / HEATMAP_GRID
    cell_w = (ext_max_lon - ext_min_lon) / HEATMAP_GRID

    # Assign each precomputed row to a display cell by its centroid.
    center_lat = (nearby["min_lat"] + nearby["max_lat"]) / 2
    center_lon = (nearby["min_lon"] + nearby["max_lon"]) / 2
    nearby["gi"] = ((center_lat - ext_min_lat) / cell_h).astype(int).clip(0, HEATMAP_GRID - 1)
    nearby["gj"] = ((center_lon - ext_min_lon) / cell_w).astype(int).clip(0, HEATMAP_GRID - 1)

    agg = nearby.groupby(["gi", "gj"]).agg(
        species_count=("species_count", "mean"),
        obs_count=("obs_count", "sum"),
        interpolated=("interpolated", "all"),
    )
    # Best top_species comes from the highest-diversity precomputed cell in each display cell.
    best_top = (
        nearby.loc[nearby.groupby(["gi", "gj"])["species_count"].idxmax()]
        .set_index(["gi", "gj"])["top_species_json"]
    )

    cells = []
    for (gi, gj), row in agg.iterrows():
        cells.append({
            "min_lat": ext_min_lat + gi * cell_h,
            "max_lat": ext_min_lat + (gi + 1) * cell_h,
            "min_lon": ext_min_lon + gj * cell_w,
            "max_lon": ext_min_lon + (gj + 1) * cell_w,
            "species_count": float(row["species_count"]),
            "obs_count": int(row["obs_count"]),
            "top_species": _parse_top_species(best_top.get((gi, gj), "[]")),
            "interpolated": bool(row["interpolated"]),
        })

    if not cells:
        return {"cells": [], "max_species": 1}

    return {
        "cells": cells,
        "max_species": max(c["species_count"] for c in cells),
    }


@st.cache_data(show_spinner=False)
def _load_species_grid_df() -> pd.DataFrame | None:
    try:
        return pd.read_csv(SPECIES_GRID_CSV_PATH)
    except Exception as e:
        st.sidebar.warning(f"Could not load species grid CSV: {e}")
        return None


def _parse_top_species(value: str) -> list[str]:
    try:
        parsed = json.loads(value) if isinstance(value, str) else []
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def _parse_bounds(raw_bounds: dict | None) -> dict | None:
    if not raw_bounds:
        return None
    south_west = raw_bounds.get("_southWest")
    north_east = raw_bounds.get("_northEast")
    if not south_west or not north_east:
        return None
    return {
        "min_lat": round(south_west["lat"], 6),
        "max_lat": round(north_east["lat"], 6),
        "min_lon": round(south_west["lng"], 6),
        "max_lon": round(north_east["lng"], 6),
    }


def _optimize(ctype: str) -> list | None:
    try:
        r = requests.post(
            f"{BACKEND_URL}/optimize",
            json={
                "construction_type": ctype,
                "grid_size": OPTIMIZE_GRID_SIZE,
                "top_n": OPTIMIZE_TOP_N,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["sites"]
    except Exception as e:
        st.sidebar.error(f"Optimize error: {e}")
        return None


def _eco_delta(impact_pct: float) -> float:
    """Convert impact percentage to ecological credit change."""
    return impact_pct * ECO_CREDIT_MULTIPLIER



# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.title("🐦 AskABird")
    st.caption("AI for Environmental Sustainability")
    st.markdown("---")

    # Construction type selector
    st.subheader("🏗️ Drop a Structure")
    ctype_label = st.selectbox(
        "Construction type",
        list(CONSTRUCTION_TYPES.keys()),
        key="ctype_selector",
    )
    st.session_state.selected_ctype = CONSTRUCTION_TYPES[ctype_label]

    st.markdown(
        "_Click anywhere on the map to place the selected structure and see its biodiversity impact._"
    )

    # Optimize button
    st.markdown("---")
    st.subheader("🔍 Find Optimal Sites")
    st.caption(
        f"Runs {OPTIMIZE_GRID_SIZE * OPTIMIZE_GRID_SIZE}-point grid search "
        f"to find the {OPTIMIZE_TOP_N} lowest-impact locations."
    )
    if st.button("✨ Optimize Placement", use_container_width=True):
        with st.spinner("Running optimisation…"):
            sites = _optimize(st.session_state.selected_ctype)
        if sites:
            st.session_state.optimal_sites = sites
            st.success(f"Found {len(sites)} optimal sites!")

    # Species diversity heatmap
    st.markdown("---")
    st.subheader("🌡️ Species Diversity Heatmap")
    st.toggle(
        "Show heatmap overlay",
        key="show_species_heatmap",
        help="Turn the bird-species heatmap on or off.",
    )
    st.caption(
        f"Auto-updating {HEATMAP_GRID}×{HEATMAP_GRID} grid centred on the current view."
    )

    # Balance sheet
    st.markdown("---")
    st.subheader("📊 Ecological Balance Sheet")
    credit = st.session_state.eco_credit
    credit_color = "green" if credit >= 80 else "orange" if credit >= 50 else "red"
    st.markdown(
        f"**Ecological Credit:** <span style='color:{credit_color}; font-size:1.4em'>"
        f"{credit:.1f}</span> / 100",
        unsafe_allow_html=True,
    )
    st.progress(max(0, min(100, int(credit))) / 100)

    if st.session_state.markers:
        st.markdown("**Structures placed:**")
        for m in st.session_state.markers[-5:]:
            pct = m.get("impact_pct", 0)
            emoji = "🔴" if pct < -20 else "🟠" if pct < -5 else "🟢"
            st.markdown(
                f"{emoji} `{m['ctype'].replace('_',' ').title()}` "
                f"({m['lat']:.3f}, {m['lon']:.3f}) → {pct:.1f}%"
            )

    # Chat interface
    st.markdown("---")
    st.subheader("💬 Chat with the Bird")

    chat_container = st.container(height=320)
    with chat_container:
        for msg in st.session_state.chat_history:
            role_icon = "🧑" if msg["role"] == "user" else "🐦"
            with st.chat_message(msg["role"], avatar=role_icon):
                st.markdown(msg["content"])

    user_input = st.chat_input("Ask the bird anything…")
    if user_input:
        st.session_state.chat_history.append({"role": "user", "content": user_input})
        # Use last placed marker for context, or Tucson centre
        if st.session_state.markers:
            last = st.session_state.markers[-1]
            pred_ctx = {
                "baseline_score": last.get("baseline_score", 0.7),
                "impact_score": last.get("impact_score", 0.5),
                "delta": last.get("delta", -0.2),
                "impact_pct": last.get("impact_pct", -20.0),
                "offsets": last.get("offsets", []),
            }
            resp = _chat(last["lat"], last["lon"], last["ctype"], pred_ctx, user_input)
        else:
            resp = (
                "*tweet tweet* — No structure has been placed yet! "
                "Click on the map to drop a building and I'll tell you how it affects my home."
            )
        if resp:
            st.session_state.chat_history.append({"role": "assistant", "content": resp})
        st.rerun()

    if st.button("🗑️ Clear chat", use_container_width=True):
        st.session_state.chat_history = []
        st.rerun()

# ---------------------------------------------------------------------------
# Main map area
# ---------------------------------------------------------------------------
st.markdown("### 🗺️ Arizona — Biodiversity Impact Map")
st.caption(
    "Click on the map to drop your selected structure. "
    "Green circles = AI-suggested optimal sites."
)

# Recompute the display grid every render so it always matches the current viewport.
if st.session_state.show_species_heatmap:
    st.session_state.species_grid = _fetch_species_grid(st.session_state.map_bounds)
else:
    st.session_state.species_grid = None

# Build Folium map at the last known center/zoom so reruns don't snap the view.
m = folium.Map(
    location=st.session_state.map_center,
    zoom_start=st.session_state.map_zoom,
    tiles="CartoDB positron",
)

# Add existing markers
for marker in st.session_state.markers:
    pct = marker.get("impact_pct", 0)
    color = CONSTRUCTION_COLORS.get(marker["ctype"], "blue")
    popup_html = (
        f"<b>{marker['ctype'].replace('_',' ').title()}</b><br>"
        f"Baseline: {marker.get('baseline_score', 0):.3f}<br>"
        f"Post-build: {marker.get('impact_score', 0):.3f}<br>"
        f"Change: <span style='color:{'red' if pct < 0 else 'green'}'>{pct:.1f}%</span>"
    )
    folium.Marker(
        location=[marker["lat"], marker["lon"]],
        popup=folium.Popup(popup_html, max_width=200),
        icon=folium.Icon(color=color, icon="home", prefix="fa"),
    ).add_to(m)

# Add species diversity heatmap (colored rectangles)
grid_data = st.session_state.get("species_grid")
if st.session_state.show_species_heatmap and grid_data and grid_data.get("cells"):
    counts = np.array([c["species_count"] for c in grid_data["cells"]], dtype=float)
    mean_sp = float(np.mean(counts))
    std_sp = float(np.std(counts))
    vmax_sp = max(mean_sp + 0.75 * std_sp, 1.0)
    colormap = cm.LinearColormap(
        colors=["#f0f9e8", "#bae4bc", "#7bccc4", "#2b8cbe", "#084081"],
        vmin=0,
        vmax=vmax_sp,
        caption="Unique bird species per cell",
    )
    for cell in grid_data["cells"]:
        sp = cell["species_count"]
        is_interp = cell.get("interpolated", False)
        top = cell["top_species"]
        species_html = "".join(f"<li>{s}</li>" for s in top) if top else "<li>none</li>"
        if is_interp:
            popup_text = (
                f"<b>~{sp:.0f} species (estimated)</b><br>"
                f"<span style='color:#b45309'>⚠️ Interpolated — no eBird hotspot recorded "
                f"in this cell. Value estimated via IDW from neighbouring cells.<br>"
                f"Treat with caution.</span>"
            )
            rect_kwargs = dict(
                color="#fb923c",
                weight=1.0,
                dash_array="6 4",
                fill=True,
                fill_color=colormap(sp),
                fill_opacity=0.12,
            )
        else:
            popup_text = (
                f"<b>{sp:.0f} species</b> ({cell['obs_count']} hotspots)<br>"
                f"Top locations:<ul>{species_html}</ul>"
            )
            rect_kwargs = dict(
                color=None,
                fill=True,
                fill_color=colormap(sp) if sp > 0 else "none",
                fill_opacity=0.2 if sp > 0 else 0.0,
            )

        folium.Rectangle(
            bounds=[[cell["min_lat"], cell["min_lon"]], [cell["max_lat"], cell["max_lon"]]],
            popup=folium.Popup(popup_text, max_width=230),
            tooltip=f"~{sp:.0f} sp (est.)" if is_interp else f"{sp:.0f} species",
            **rect_kwargs,
        ).add_to(m)
    colormap.add_to(m)

# Add optimal site circles (green)
for site in st.session_state.optimal_sites:
    folium.CircleMarker(
        location=[site["lat"], site["lon"]],
        radius=14,
        color="green",
        fill=True,
        fill_color="green",
        fill_opacity=0.35,
        popup=folium.Popup(
            f"<b>Optimal Site</b><br>Impact score: {site['impact_score']:.3f}<br>"
            f"Δ {site['delta']:.3f}",
            max_width=160,
        ),
    ).add_to(m)

# Render map — capture click, bounds, centre, and zoom.
map_data = st_folium(
    m,
    width="100%",
    height=620,
    returned_objects=["last_clicked", "bounds", "center", "zoom"],
)

# Persist the current view so the map rebuilds at the right position on rerun.
raw_center = map_data.get("center")
raw_zoom = map_data.get("zoom")
if raw_center:
    st.session_state.map_center = [raw_center["lat"], raw_center["lng"]]
if raw_zoom:
    st.session_state.map_zoom = raw_zoom
new_bounds = _parse_bounds(map_data.get("bounds"))
if new_bounds:
    st.session_state.map_bounds = new_bounds

# ---------------------------------------------------------------------------
# Handle map click → predict → chat
# ---------------------------------------------------------------------------
clicked = map_data.get("last_clicked")
if clicked and clicked != st.session_state.last_click:
    st.session_state.last_click = clicked
    lat = clicked["lat"]
    lon = clicked["lng"]
    ctype = st.session_state.selected_ctype

    with st.spinner(f"Predicting impact of {ctype.replace('_', ' ')}…"):
        pred = _predict(lat, lon, ctype)

    if pred:
        # Store marker
        st.session_state.markers.append(
            {
                "lat": lat,
                "lon": lon,
                "ctype": ctype,
                **pred,
            }
        )

        # Update ecological credit
        st.session_state.eco_credit = max(
            0.0,
            st.session_state.eco_credit + _eco_delta(pred["impact_pct"]),
        )

        # Auto-generate bird response
        with st.spinner("Asking the bird…"):
            bird_msg = _chat(lat, lon, ctype, pred, "")
        if bird_msg:
            st.session_state.chat_history.append(
                {"role": "assistant", "content": bird_msg}
            )

        # Show impact summary
        pct = pred["impact_pct"]
        col1, col2, col3 = st.columns(3)
        col1.metric("Baseline Score", f"{pred['baseline_score']:.3f}")
        col2.metric("Post-Build Score", f"{pred['impact_score']:.3f}", delta=f"{pct:.1f}%")
        col3.metric("Ecological Credit", f"{st.session_state.eco_credit:.1f}")

        st.rerun()
