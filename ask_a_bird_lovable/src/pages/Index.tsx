import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Bird, MapPin } from "lucide-react";
import MapView, { TUCSON_CENTER } from "@/components/MapView";
import BirdChat, { type SiteContext } from "@/components/BirdChat";
import BirdCombobox from "@/components/BirdCombobox";
import { useRegionBiodiversity } from "@/hooks/useRegionBiodiversity";
import { cn } from "@/lib/utils";
import cactusWrenImg from "@/assets/birds/cactus-wren.png";
import vermilionFlycatcherImg from "@/assets/birds/vermilion-flycatcher.png";
import gambelsQuailImg from "@/assets/birds/gambels-quail.png";
import greaterRoadrunnerImg from "@/assets/birds/greater-roadrunner.png";
import greatHornedOwlImg from "@/assets/birds/great-horned-owl.png";

// Listed top-to-bottom in the chip row.
const TUCSON_DEFAULT_BIRDS: { name: string; img: string }[] = [
  { name: "Cactus Wren", img: cactusWrenImg },
  { name: "Vermilion Flycatcher", img: vermilionFlycatcherImg },
  { name: "Gambel's Quail", img: gambelsQuailImg },
  { name: "Greater Roadrunner", img: greaterRoadrunnerImg },
  { name: "Great Horned Owl", img: greatHornedOwlImg },
];

const CACTUS_WREN_GREETING =
  "Pretend you are a friendly Cactus Wren, the Arizona state bird, greeting a human who just opened a web app called 'Ask a Bird'. In 3-4 short sentences, warmly welcome them and explain what they can do here: (1) click anywhere on the map to chat with a local bird about that exact spot, (2) pick one of the top birds nearby (or search for any bird actually seen at that location) to swap who they're talking to, and (3) toggle the biodiversity, endangered, and migration heatmaps in the top-right of the map to see which areas matter most. Sprinkle in a tiny bit of desert personality. Do not mention that you are an AI.";

export default function Index() {
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [birdSpecies, setBirdSpecies] = useState<string>(TUCSON_DEFAULT_BIRDS[0].name);
  // Viewport center — updates as the user pans the map, so heatmaps refetch
  // for whatever region they're exploring (not just Tucson).
  const [viewCenter, setViewCenter] = useState<{ lat: number; lon: number }>({
    lat: TUCSON_CENTER[0],
    lon: TUCSON_CENTER[1],
  });

  const activeLat = location?.lat ?? TUCSON_CENTER[0];
  const activeLon = location?.lon ?? TUCSON_CENTER[1];
  const { region, loading: regionLoading, refresh } = useRegionBiodiversity(
    viewCenter.lat,
    viewCenter.lon,
  );

  const siteContext: SiteContext = {
    lat: activeLat,
    lon: activeLon,
    construction_type: "none",
    baseline_score: 0.5,
    impact_score: 0.5,
    delta: 0,
    top_species: [],
  };

  return (
    <div className="container py-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bird className="h-7 w-7 text-primary" />
          Ask a Bird
        </h1>
        <p className="text-muted-foreground mt-1">
          Click the map to chat about a specific spot — or pick a bird that lives nearby.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
        {/* Left: chat — same height as the map for a balanced layout */}
        <Card className="shadow-[var(--shadow-soft)] p-4 flex flex-col h-[calc(100vh-14rem)] min-h-[420px]">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Top birds nearby
            </Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TUCSON_DEFAULT_BIRDS.map(({ name, img }) => {
                const isActive = birdSpecies === name;
                return (
                  <button
                    key={name}
                    onClick={() => setBirdSpecies(name)}
                    className={cn(
                      "rounded-full pl-1 pr-3 py-1 text-xs font-medium border transition-colors flex items-center gap-1.5",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted",
                    )}
                  >
                    <img
                      src={img}
                      alt=""
                      className="h-5 w-5 rounded-full object-cover bg-muted ring-1 ring-border/40"
                    />
                    {name}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Or search a bird actually seen here
              </Label>
              <BirdCombobox
                lat={activeLat}
                lon={activeLon}
                value={birdSpecies}
                onChange={setBirdSpecies}
              />
            </div>

            {location && (
              <p className="text-xs text-muted-foreground mt-2">
                Near {location.lat.toFixed(3)}, {location.lon.toFixed(3)}
              </p>
            )}
          </div>

          <div className="mt-4 flex-1 min-h-0 overflow-hidden">
            <BirdChat
              key={`${birdSpecies}-${activeLat}-${activeLon}`}
              siteContext={siteContext}
              birdSpecies={birdSpecies}
              autoOpener={
                !location && birdSpecies === "Cactus Wren" ? CACTUS_WREN_GREETING : undefined
              }
            />
          </div>
        </Card>

        {/* Right: sticky map (matches Optimize page height) */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
            <div className="h-[calc(100vh-14rem)] min-h-[420px] relative">
              <MapView
                center={location ? [location.lat, location.lon] : TUCSON_CENTER}
                zoom={11}
                proposed={location}
                onMapClick={(lat, lon) => setLocation({ lat, lon })}
                region={region}
                regionLoading={regionLoading}
                onCenterChange={(lat, lon) => setViewCenter({ lat, lon })}
                onRefreshRegion={refresh}
              />
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur border border-border rounded-full px-4 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)] flex items-center gap-1.5 z-[1000]">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Click the map to chat about this spot
              </div>
            </div>
          </Card>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2">
        Bird sighting data powered by{" "}
        <a
          href="https://ebird.org"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          eBird
        </a>
        .
      </p>
    </div>
  );
}
