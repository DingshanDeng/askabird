import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface NearbyBird {
  speciesCode: string;
  comName: string;
  count: number;
}

interface Props {
  lat: number;
  lon: number;
  value: string;
  onChange: (name: string) => void;
}

export default function BirdCombobox({ lat, lon, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [birds, setBirds] = useState<NearbyBird[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("nearby-birds", {
          body: { lat, lon },
        });
        if (cancelled) return;
        if (error) throw error;
        const list: NearbyBird[] = (data?.species ?? []).map((s: NearbyBird) => s);
        setBirds(list);
      } catch (e) {
        console.error("nearby-birds failed", e);
        if (!cancelled) setBirds([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{value || "Search birds seen nearby…"}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type a bird name…" />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading nearby species…
              </div>
            ) : (
              <>
                <CommandEmpty>No matching birds reported here.</CommandEmpty>
                <CommandGroup heading="Recently seen within 1 mile">
                  {birds.map((b) => (
                    <CommandItem
                      key={b.speciesCode}
                      value={b.comName}
                      onSelect={(v) => {
                        onChange(v);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === b.comName ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">{b.comName}</span>
                      <span className="text-xs text-muted-foreground ml-2">×{b.count}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
