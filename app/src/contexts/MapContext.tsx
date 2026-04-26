import { createContext, useContext, useState, type ReactNode } from "react";
import { TUCSON_CENTER } from "@/components/MapView";

interface MapState {
  sharedPin: { lat: number; lon: number } | null;
  setSharedPin: (pin: { lat: number; lon: number } | null) => void;
  sharedCenter: { lat: number; lon: number };
  setSharedCenter: (center: { lat: number; lon: number }) => void;
  sharedZoom: number;
  setSharedZoom: (zoom: number) => void;
}

const MapContext = createContext<MapState | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [sharedPin, setSharedPin] = useState<{ lat: number; lon: number } | null>(null);
  const [sharedCenter, setSharedCenter] = useState({ lat: TUCSON_CENTER[0], lon: TUCSON_CENTER[1] });
  const [sharedZoom, setSharedZoom] = useState(11);

  return (
    <MapContext.Provider value={{ sharedPin, setSharedPin, sharedCenter, setSharedCenter, sharedZoom, setSharedZoom }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapState() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapState must be used inside MapProvider");
  return ctx;
}
