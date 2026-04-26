import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Bird, MapPin, ChevronDown, Check, Loader2 } from "lucide-react";
import MapView, { TUCSON_CENTER } from "@/components/MapView";
import BirdChat, { type SiteContext } from "@/components/BirdChat";
import { useRegionBiodiversity } from "@/hooks/useRegionBiodiversity";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getBirdAvatar } from "@/assets/birds";
import cactusWrenImg from "@/assets/birds/cactus-wren.png";
import vermilionFlycatcherImg from "@/assets/birds/vermilion-flycatcher.png";
import gambelsQuailImg from "@/assets/birds/gambels-quail.png";
import greaterRoadrunnerImg from "@/assets/birds/greater-roadrunner.png";
import greatHornedOwlImg from "@/assets/birds/great-horned-owl.png";
import type { NearbyBird } from "@/components/BirdCombobox";

const TUCSON_DEFAULT_BIRDS: { name: string; img: string }[] = [
  { name: "Cactus Wren", img: cactusWrenImg },
  { name: "Vermilion Flycatcher", img: vermilionFlycatcherImg },
  { name: "Gambel's Quail", img: gambelsQuailImg },
  { name: "Greater Roadrunner", img: greaterRoadrunnerImg },
  { name: "Great Horned Owl", img: greatHornedOwlImg },
];

const DEFAULT_NAMES = new Set(TUCSON_DEFAULT_BIRDS.map((b) => b.name.toLowerCase()));

const CACTUS_WREN_GREETING =
  "Chirp! Welcome to Ask a Bird — I'm your Cactus Wren guide! 🌵 Click anywhere on the map to chat with the local bird at that spot, or tap my photo above to switch who you're talking to. Flip on the heatmap layers in the top-right to see where the biodiversity hotspots are. Ask me anything!";

export default function Index() {
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [birdSpecies, setBirdSpecies] = useState<string>(TUCSON_DEFAULT_BIRDS[0].name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nearbyBirds, setNearbyBirds] = useState<NearbyBird[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
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

  // Fetch recently sighted birds when picker opens
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setLoadingNearby(true);
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("nearby-birds", {
          body: { lat: activeLat, lon: activeLon },
        });
        if (!cancelled) setNearbyBirds(data?.species ?? []);
      } catch {
        if (!cancelled) setNearbyBirds([]);
      } finally {
        if (!cancelled) setLoadingNearby(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pickerOpen, activeLat, activeLon]);

  const siteContext: SiteContext = {
    lat: activeLat,
    lon: activeLon,
    construction_type: "none",
    baseline_score: 0.5,
    impact_score: 0.5,
    delta: 0,
    top_species: [],
  };

  const currentAvatar = getBirdAvatar(birdSpecies);
  const recentlyBirds = nearbyBirds.filter((b) => !DEFAULT_NAMES.has(b.comName.toLowerCase()));

  const selectBird = (name: string) => {
    setBirdSpecies(name);
    setPickerOpen(false);
  };

  return (
    <div className="container py-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bird className="h-7 w-7 text-primary" />
          Ask a Bird
        </h1>
        <p className="text-muted-foreground mt-1">
          Click the map to chat about a specific spot — or tap the bird to switch species.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
        {/* Left: chat panel */}
        <Card className="shadow-[var(--shadow-soft)] flex flex-col h-[calc(100vh-14rem)] min-h-[420px] overflow-hidden">

          {/* Clickable bird contact header */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted/40 transition-colors w-full text-left shrink-0">
                {currentAvatar ? (
                  <img
                    src={currentAvatar}
                    alt={birdSpecies}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-saguaro/30 bg-muted shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-saguaro/15 text-saguaro flex items-center justify-center shrink-0">
                    <Bird className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{birdSpecies}</div>
                  <div className="text-xs text-muted-foreground">Local Sonoran resident · tap to switch</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>

            <PopoverContent className="w-72 p-0" align="start" sideOffset={4}>
              <Command>
                <CommandInput placeholder="Search birds…" />
                <CommandList>
                  <CommandEmpty>No matching birds found.</CommandEmpty>

                  <CommandGroup heading="Local Bird Ambbassadors">
                    {TUCSON_DEFAULT_BIRDS.map(({ name, img }) => (
                      <CommandItem
                        key={name}
                        value={name}
                        onSelect={selectBird}
                        className="gap-2"
                      >
                        <img
                          src={img}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover ring-1 ring-border/40 bg-muted shrink-0"
                        />
                        <span className="flex-1 truncate">{name}</span>
                        <Check className={cn("h-4 w-4 shrink-0", birdSpecies === name ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                    ))}
                  </CommandGroup>

                  <CommandGroup heading="Recently Sighted Neighbors">
                    {loadingNearby ? (
                      <div className="flex items-center gap-2 py-4 px-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading nearby species…
                      </div>
                    ) : recentlyBirds.length === 0 ? (
                      <div className="py-3 px-2 text-xs text-muted-foreground">
                        No other species reported here yet.
                      </div>
                    ) : (
                      recentlyBirds.map((b) => (
                        <CommandItem
                          key={b.speciesCode}
                          value={b.comName}
                          onSelect={selectBird}
                          className="gap-2"
                        >
                          <div className="h-7 w-7 rounded-full bg-saguaro/10 text-saguaro flex items-center justify-center shrink-0">
                            <Bird className="h-3.5 w-3.5" />
                          </div>
                          <span className="flex-1 truncate">{b.comName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">×{b.count}</span>
                        </CommandItem>
                      ))
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Chat fills the rest */}
          <div className="flex-1 min-h-0 overflow-hidden p-4 pt-3">
            <BirdChat
              key={`${birdSpecies}-${activeLat}-${activeLon}`}
              siteContext={siteContext}
              birdSpecies={birdSpecies}
              initialMessage={
                !location && birdSpecies === "Cactus Wren" ? CACTUS_WREN_GREETING : undefined
              }
              quickReplies={[
                "What do you eat around here?",
                "What's the biggest threat to birds in Tucson?",
                "Are there any endangered birds nearby?",
                "Tell me about migration season here",
              ]}
              hideHeader
            />
          </div>
        </Card>

        {/* Right: sticky map */}
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
    </div>
  );
}
