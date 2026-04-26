import { MapContainer, TileLayer, Marker, useMapEvents, Popup, Rectangle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, ShieldAlert, Feather, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Fix default icon path for Vite bundling
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// @ts-expect-error — patching default
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export const TUCSON_CENTER: [number, number] = [32.2226, -110.9747];

const proposedIcon = new L.DivIcon({
  className: "",
  html: `<div style="
    width: 28px; height: 28px; border-radius: 50%;
    background: hsl(14 65% 48%);
    border: 3px solid white;
    box-shadow: 0 4px 10px hsl(14 65% 30% / 0.5);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  ">📍</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const historyIcon = new L.DivIcon({
  className: "",
  html: `<div style="
    width: 18px; height: 18px; border-radius: 50%;
    background: hsl(130 35% 32%);
    border: 2px solid white;
    box-shadow: 0 2px 6px hsl(130 35% 20% / 0.4);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const suggestionIcon = new L.DivIcon({
  className: "",
  html: `<div style="
    width: 22px; height: 22px; border-radius: 50%;
    background: hsl(130 50% 45%);
    border: 2px dashed white;
    box-shadow: 0 2px 6px hsl(130 50% 25% / 0.4);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: 700;
  ">★</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export type SitePin = {
  id: string;
  lat: number;
  lon: number;
  construction_type: string;
  delta: number | null;
};

export type Suggestion = {
  lat: number;
  lon: number;
  distance_km: number;
  reason: string;
  baseline: number;
  impact: number;
  delta: number;
  is_good_site?: boolean;
};

export type RegionCell = {
  i: number;
  j: number;
  lat: number;
  lon: number;
  species_count: number;
  sensitive: { name: string; status: string }[];
  migratory: string[];
};

export type RegionData = {
  center: { lat: number; lon: number };
  half_span_deg: number;
  grid_size: number;
  step_lat: number;
  step_lon: number;
  cells: RegionCell[];
};

interface ClickHandlerProps {
  onClick: (lat: number, lon: number) => void;
}

function ClickHandler({ onClick }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMapEvents({});
  useEffect(() => {
    map.panTo(center);
  }, [center[0], center[1]]);
  return null;
}

function MoveTracker({ onMove }: { onMove: (lat: number, lon: number) => void }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      onMove(c.lat, c.lng);
    },
  });
  return null;
}

interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  proposed?: { lat: number; lon: number } | null;
  history?: SitePin[];
  suggestions?: Suggestion[];
  onMapClick?: (lat: number, lon: number) => void;
  onSuggestionClick?: (s: Suggestion) => void;
  recenterOnCenterChange?: boolean;
  region?: RegionData | null;
  regionLoading?: boolean;
  onCenterChange?: (lat: number, lon: number) => void;
  onRefreshRegion?: () => void;
}

type LayerKey = "heatmap" | "endangered" | "migratory";

function HeatmapLayer({ region }: { region: RegionData }) {
  const maxCount = useMemo(
    () => Math.max(1, ...region.cells.map((c) => c.species_count)),
    [region],
  );
  return (
    <>
      {region.cells.map((c) => {
        if (c.species_count === 0) return null;
        const t = c.species_count / maxCount;
        // Green ramp: lighter -> darker
        const opacity = 0.15 + 0.55 * t;
        const south = c.lat - region.step_lat / 2;
        const north = c.lat + region.step_lat / 2;
        const west = c.lon - region.step_lon / 2;
        const east = c.lon + region.step_lon / 2;
        return (
          <Rectangle
            key={`heat-${c.i}-${c.j}`}
            bounds={[[south, west], [north, east]] as L.LatLngBoundsExpression}
            pathOptions={{
              color: "hsl(140 55% 25%)",
              weight: 0.5,
              fillColor: "hsl(140 55% 30%)",
              fillOpacity: opacity,
            }}
          >
            <Popup>
              <div className="text-xs">
                <strong>{c.species_count}</strong> unique species recorded here
              </div>
            </Popup>
          </Rectangle>
        );
      })}
    </>
  );
}

function EndangeredLayer({ region }: { region: RegionData }) {
  const maxCount = useMemo(
    () => Math.max(1, ...region.cells.map((c) => c.sensitive.length)),
    [region],
  );
  return (
    <>
      {region.cells.map((c) => {
        if (c.sensitive.length === 0) return null;
        const t = c.sensitive.length / maxCount;
        const opacity = 0.2 + 0.6 * t;
        const south = c.lat - region.step_lat / 2;
        const north = c.lat + region.step_lat / 2;
        const west = c.lon - region.step_lon / 2;
        const east = c.lon + region.step_lon / 2;
        return (
          <Rectangle
            key={`end-${c.i}-${c.j}`}
            bounds={[[south, west], [north, east]] as L.LatLngBoundsExpression}
            pathOptions={{
              color: "hsl(0 75% 30%)",
              weight: 0.5,
              fillColor: "hsl(0 75% 45%)",
              fillOpacity: opacity,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-semibold">
                  {c.sensitive.length} sensitive species in this area
                </div>
                {c.sensitive.slice(0, 5).map((s) => (
                  <div key={s.name}>
                    {s.name} <span className="text-muted-foreground">— {s.status}</span>
                  </div>
                ))}
              </div>
            </Popup>
          </Rectangle>
        );
      })}
    </>
  );
}

function MigratoryLayer({ region }: { region: RegionData }) {
  const maxCount = useMemo(
    () => Math.max(1, ...region.cells.map((c) => c.migratory.length)),
    [region],
  );
  return (
    <>
      {region.cells.map((c) => {
        if (c.migratory.length === 0) return null;
        const t = c.migratory.length / maxCount;
        const opacity = 0.18 + 0.55 * t;
        const south = c.lat - region.step_lat / 2;
        const north = c.lat + region.step_lat / 2;
        const west = c.lon - region.step_lon / 2;
        const east = c.lon + region.step_lon / 2;
        return (
          <Rectangle
            key={`mig-${c.i}-${c.j}`}
            bounds={[[south, west], [north, east]] as L.LatLngBoundsExpression}
            pathOptions={{
              color: "hsl(35 90% 30%)",
              weight: 0.5,
              fillColor: "hsl(35 90% 45%)",
              fillOpacity: opacity,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-semibold">
                  {c.migratory.length} migratory species recorded
                </div>
                {c.migratory.slice(0, 6).map((s) => (
                  <div key={s}>{s}</div>
                ))}
              </div>
            </Popup>
          </Rectangle>
        );
      })}
    </>
  );
}

interface OverlayPanelProps {
  active: Record<LayerKey, boolean>;
  onToggle: (k: LayerKey) => void;
  loading?: boolean;
  hasRegion: boolean;
  onRefresh?: () => void;
}

function OverlayPanel({ active, onToggle, loading, hasRegion, onRefresh }: OverlayPanelProps) {
  const items: { key: LayerKey; label: string; Icon: typeof Layers; color: string }[] = [
    { key: "heatmap", label: "Biodiversity", Icon: Layers, color: "hsl(140 55% 30%)" },
    { key: "endangered", label: "Endangered", Icon: ShieldAlert, color: "hsl(0 75% 50%)" },
    { key: "migratory", label: "Migration", Icon: Feather, color: "hsl(35 90% 50%)" },
  ];
  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1 bg-card/95 backdrop-blur border border-border rounded-lg shadow-[var(--shadow-soft)] p-1.5">
      {items.map(({ key, label, Icon, color }) => {
        const isActive = active[key];
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            disabled={!hasRegion}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors w-full text-left",
              isActive
                ? "bg-foreground text-background"
                : "text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            title={hasRegion ? label : "Loading map data…"}
          >
            <Icon className="h-3.5 w-3.5" style={isActive ? undefined : { color }} />
            <span>{label}</span>
          </button>
        );
      })}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted border-t border-border mt-1 pt-2"
          title="Refresh map data for this view"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          <span>Refresh</span>
        </button>
      )}
      {loading && !onRefresh && (
        <div className="text-[10px] text-muted-foreground px-2 pt-1">Loading…</div>
      )}
    </div>
  );
}

export default function MapView({
  center = TUCSON_CENTER,
  zoom = 11,
  proposed,
  history = [],
  suggestions = [],
  onMapClick,
  onSuggestionClick,
  recenterOnCenterChange = false,
  region = null,
  regionLoading = false,
  onCenterChange,
  onRefreshRegion,
}: MapViewProps) {
  const [active, setActive] = useState<Record<LayerKey, boolean>>({
    heatmap: false,
    endangered: false,
    migratory: false,
  });

  // Force leaflet to recalc size after mount (handles flex containers)
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    return () => clearTimeout(t);
  }, []);

  // Debounce onCenterChange so we don't spam the edge function while panning.
  const debounceRef = useRef<number | null>(null);
  const handleMove = (lat: number, lon: number) => {
    if (!onCenterChange) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => onCenterChange(lat, lon), 600);
  };

  const toggle = (k: LayerKey) => setActive((a) => ({ ...a, [k]: !a[k] }));

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onMapClick && <ClickHandler onClick={onMapClick} />}
        {recenterOnCenterChange && <MapRecenter center={center} />}
        {onCenterChange && <MoveTracker onMove={handleMove} />}

        {region && active.heatmap && <HeatmapLayer region={region} />}
        {region && active.endangered && <EndangeredLayer region={region} />}
        {region && active.migratory && <MigratoryLayer region={region} />}

        {suggestions.map((s, i) => (
          <Marker
            key={`sug-${i}`}
            position={[s.lat, s.lon]}
            icon={suggestionIcon}
            eventHandlers={onSuggestionClick ? { click: () => onSuggestionClick(s) } : undefined}
          >
            <Popup>
              <div className="text-sm">
                <strong>Better nearby spot</strong>
                <div className="text-xs text-muted-foreground mt-1">{s.distance_km} km away</div>
                <div className="text-xs mt-1">{s.reason}</div>
              </div>
            </Popup>
          </Marker>
        ))}
        {history.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lon]} icon={historyIcon}>
            <Popup>
              <div className="text-sm">
                <strong className="capitalize">{s.construction_type.replace("_", " ")}</strong>
                {s.delta !== null && (
                  <div>Δ score: <span className={s.delta < 0 ? "text-red-600" : "text-green-700"}>{s.delta.toFixed(2)}</span></div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {proposed && (
          <Marker position={[proposed.lat, proposed.lon]} icon={proposedIcon}>
            <Popup>Proposed site</Popup>
          </Marker>
        )}
      </MapContainer>

      <OverlayPanel
        active={active}
        onToggle={toggle}
        loading={regionLoading}
        hasRegion={!!region}
        onRefresh={onRefreshRegion}
      />
    </div>
  );
}
