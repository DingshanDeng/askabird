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

import os
import requests
import streamlit as st
import folium
from streamlit_folium import st_folium

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

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

TUCSON_CENTER = [32.20, -110.92]
TUCSON_BOUNDS = [[32.05, -111.10], [32.35, -110.75]]

# Scales impact_pct (already negative for harm) into ecological credit points.
# e.g. a −42% impact yields −21 credit points.
ECO_CREDIT_MULTIPLIER = 0.5

# Grid search parameters used for site optimisation
OPTIMIZE_GRID_SIZE = 20
OPTIMIZE_TOP_N = 3

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
        "markers": [],          # list of {lat, lon, ctype, impact_score, delta, impact_pct, extracted_features}
        "optimal_sites": [],    # list of {lat, lon, impact_score}
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
            timeout=60,
        )
        r.raise_for_status()
        return r.json()
    except requests.exceptions.Timeout:
        st.sidebar.error("The spatial data took too long to load from OSM. Please try a different location or try again later.")
        return None
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
            timeout=60,
        )
        r.raise_for_status()
        return r.json()["bird_response"]
    except requests.exceptions.Timeout:
        st.sidebar.error("Consulting the bird took too long. The server might be busy analyzing spatial data.")
        return None
    except Exception as e:
        st.sidebar.error(f"Chat error: {e}")
        return None


def _optimize(ctype: str) -> list | None:
    try:
        r = requests.post(
            f"{BACKEND_URL}/optimize",
            json={
                "construction_type": ctype,
                "grid_size": OPTIMIZE_GRID_SIZE,
                "top_n": OPTIMIZE_TOP_N,
            },
            timeout=120, # Optimization takes much longer due to multiple points
        )
        r.raise_for_status()
        return r.json()["sites"]
    except requests.exceptions.Timeout:
        st.sidebar.error("Optimization grid search timed out. Spatial analysis for this many points is computationally intensive.")
        return None
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

    # Site Analysis Section
    if st.session_state.markers:
        last_marker = st.session_state.markers[-1]
        features = last_marker.get("extracted_features", {})
        
        if features:
            st.markdown("---")
            st.subheader("📊 Site Analysis (1km Radius)")
            
            col_a, col_b = st.columns(2)
            with col_a:
                st.metric("Nearby Buildings", f"{features.get('building_count', 0)}")
            with col_b:
                street_len_km = features.get('total_street_length', 0) / 1000.0
                st.metric("Road Density", f"{street_len_km:.2f} km")
            
            # Power facility info
            dist_m = features.get('nearest_distance_meters')
            fac_type = features.get('facility_type', 'unknown')
            if dist_m is not None:
                st.metric("Nearest Power Facility", f"{fac_type.title()}", delta=f"{dist_m/1000.0:.1f} km away", delta_color="off")
            else:
                st.metric("Nearest Power Facility", "None within 50km")

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

    # Balance sheet
    st.markdown("---")
    st.subheader("💰 Ecological Balance Sheet")
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
st.markdown("### 🗺️ Tucson, AZ — Biodiversity Impact Map")
st.caption(
    "Click on the map to drop your selected structure. "
    "Grey circles represent the 1km search radius for site density analysis."
)

# Build Folium map
m = folium.Map(
    location=TUCSON_CENTER,
    zoom_start=11,
    tiles="CartoDB positron",
)

# Add existing markers and search radius circles
for marker in st.session_state.markers:
    pct = marker.get("impact_pct", 0)
    color = CONSTRUCTION_COLORS.get(marker["ctype"], "blue")
    features = marker.get("extracted_features", {})
    b_count = features.get("building_count", "N/A")
    
    popup_html = (
        f"<b>{marker['ctype'].replace('_',' ').title()}</b><br>"
        f"Baseline: {marker.get('baseline_score', 0):.3f}<br>"
        f"Post-build: {marker.get('impact_score', 0):.3f}<br>"
        f"Change: <span style='color:{'red' if pct < 0 else 'green'}'>{pct:.1f}%</span><br>"
        f"Buildings within 1km: {b_count}"
    )
    
    # 1km radius circle
    folium.Circle(
        location=[marker["lat"], marker["lon"]],
        radius=1000,
        color="gray",
        fill=True,
        fill_color="gray",
        fill_opacity=0.1,
        weight=1
    ).add_to(m)
    
    folium.Marker(
        location=[marker["lat"], marker["lon"]],
        popup=folium.Popup(popup_html, max_width=250),
        icon=folium.Icon(color=color, icon="home", prefix="fa"),
    ).add_to(m)

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

# Render map and capture click
map_data = st_folium(
    m,
    width="100%",
    height=620,
    returned_objects=["last_clicked"],
    key="main_map",
)

# ---------------------------------------------------------------------------
# Handle map click → predict → chat
# ---------------------------------------------------------------------------
clicked = map_data.get("last_clicked")
if clicked and clicked != st.session_state.last_click:
    st.session_state.last_click = clicked
    lat = clicked["lat"]
    lon = clicked["lng"]
    ctype = st.session_state.selected_ctype

    with st.spinner("Analyzing site data and consulting the local birds... This may take up to 30 seconds."):
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
        col3.metric("Ecological Credit Balance", f"{st.session_state.eco_credit:.1f}")

        st.rerun()
