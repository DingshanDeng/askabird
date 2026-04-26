import { Telescope, Database, MapPin, Bird, MousePointerClick, MessageCircle, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import desertHero from "@/assets/desert-hero.jpg";

export default function OurStory() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <img
          src={desertHero}
          alt="Sonoran desert at golden hour with saguaro cacti and Tucson mountains"
          width={1920}
          height={1080}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        {/* Warm gradient veil to keep text readable while preserving the colors */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, hsl(var(--background)/0.55) 0%, hsl(var(--background)/0.25) 45%, hsl(var(--background)/0.85) 100%)",
          }}
        />

        <div className="container py-24 md:py-36">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-card/80 backdrop-blur px-4 py-1.5 text-xs font-medium text-foreground border border-border shadow-[var(--shadow-soft)]">
              <Sparkles className="h-3.5 w-3.5 text-terracotta" />
              Our Story
            </div>
            <h1 className="font-serif text-4xl md:text-6xl font-bold leading-[1.05] text-foreground tracking-tight drop-shadow-sm">
              From Habitat-Searching to Habitat-Saving
            </h1>
            <p className="text-base md:text-lg text-foreground/80 italic">
              A Tucson story about looking up — and looking around.
            </p>
          </div>
        </div>
      </section>

      {/* Inspiration */}
      <section className="container py-16 md:py-20">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-sunset)] text-primary-foreground shadow-[var(--shadow-warm)]">
              <Telescope className="h-5 w-5" />
            </span>
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              The Inspiration
            </h2>
          </div>
          <div className="space-y-4 text-foreground/90 leading-relaxed text-[1.05rem]">
            <p>
              We are two graduate students researching potentially habitable planets
              beyond our solar system in search of distant worlds that may support
              life.
            </p>
            <p>
              However, we realized a striking irony: while we are obsessed with finding signs of
              life on other worlds, the rapid expansion of our own cities is threatening the
              "habitable zones" of our avian neighbors right here in{" "}
              <span className="font-medium text-foreground">Tucson, Arizona</span>. We decided to
              take the same data-driven rigor we use for the cosmos and apply it to our own
              backyard.
            </p>
            <p className="border-l-4 border-terracotta pl-5 italic text-foreground/80">
              AskABird was born from a simple question:{" "}
              <span className="not-italic font-medium">
                What would a Cactus Wren think if a power plant was built in its home?
              </span>{" "}
              Before we find life in the stars, we can use technology to protect it on Earth.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/40 border-y border-border">
        <div className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl text-center space-y-3 mb-10">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              How It Works
            </h2>
            <p className="text-muted-foreground">
              We blend live wildlife data, civic mapping, and a friendly bird voice into one
              clear picture of any spot in Tucson.
            </p>
          </div>
          <div className="mx-auto max-w-5xl grid gap-5 md:grid-cols-3">
            <Card className="shadow-[var(--shadow-soft)]">
              <CardContent className="p-6 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-saguaro/15 text-saguaro">
                  <Bird className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-lg font-semibold">Real Bird Sightings</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We pull recent observations from{" "}
                  <span className="font-medium text-foreground">eBird</span>, the world's largest
                  citizen-science bird database, so every score reflects what's actually flying
                  around right now.
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-[var(--shadow-soft)]">
              <CardContent className="p-6 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <MapPin className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-lg font-semibold">Open Map Data</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Land use, roads, and existing development come from{" "}
                  <span className="font-medium text-foreground">OpenStreetMap (OSM)</span>, so the
                  bird's view of "your spot" matches the real Tucson on the ground.
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-[var(--shadow-soft)]">
              <CardContent className="p-6 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-terracotta/15 text-terracotta">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-lg font-semibold">A Data-Driven Score</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A weighted matrix combines endangered-species proximity, migratory pressure,
                  and local biodiversity into a single safety score — then a bird from the
                  neighborhood explains it in plain English.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How to use */}
      <section className="container py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center space-y-3 mb-10">
          <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
            How to use AskABird
          </h2>
          <p className="text-muted-foreground">Three steps. No setup. Just curiosity.</p>
        </div>
        <div className="mx-auto max-w-4xl grid gap-5 md:grid-cols-3">
          {[
            {
              n: 1,
              icon: Bird,
              title: "Pick a bird friend",
              body:
                "Choose a local Sonoran species — like the Cactus Wren or Greater Roadrunner — to be your guide.",
            },
            {
              n: 2,
              icon: MousePointerClick,
              title: "Click any spot on the Tucson map",
              body:
                "Drop a pin where you're curious or where a project might go. We'll fetch the local bird story.",
            },
            {
              n: 3,
              icon: MessageCircle,
              title: "Watch history unfold and chat",
              body:
                "See nearby sightings, the impact score, and ask the bird anything about that place.",
            },
          ].map(({ n, icon: Icon, title, body }) => (
            <div
              key={n}
              className="relative rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
            >
              <div className="absolute -top-3 -left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-sunset)] text-primary-foreground font-bold text-sm shadow-[var(--shadow-warm)]">
                {n}
              </div>
              <Icon className="h-6 w-6 text-saguaro mb-3" />
              <h3 className="font-serif text-lg font-semibold mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Math callout */}
      <section className="container pb-20">
        <div className="mx-auto max-w-2xl">
          <div className="relative rounded-2xl border border-border bg-[hsl(var(--sand)/0.25)] p-8 md:p-10 text-center shadow-[var(--shadow-soft)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground border border-border mb-5">
              <Sparkles className="h-3 w-3 text-terracotta" />
              The Math Behind It
            </div>
            <h3 className="font-serif text-xl font-semibold mb-4 text-foreground">
              Biodiversity Impact Formula
            </h3>
            <div className="font-serif text-3xl md:text-4xl text-foreground tracking-wide my-6">
              <span className="italic">S</span>
              <sub className="text-base">impact</sub>
              <span className="mx-3">=</span>
              <span className="italic">f</span>
              <span className="text-muted-foreground">(</span>
              <span className="italic">B</span>
              <span className="text-muted-foreground">,</span>{" "}
              <span className="italic">R</span>
              <span className="text-muted-foreground">,</span>{" "}
              <span className="italic">D</span>
              <span className="text-muted-foreground">)</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm pt-4 border-t border-border/60">
              <div>
                <div className="font-serif text-lg italic text-terracotta">B</div>
                <div className="text-muted-foreground text-xs">Biodiversity richness</div>
              </div>
              <div>
                <div className="font-serif text-lg italic text-terracotta">R</div>
                <div className="text-muted-foreground text-xs">Rare / endangered proximity</div>
              </div>
              <div>
                <div className="font-serif text-lg italic text-terracotta">D</div>
                <div className="text-muted-foreground text-xs">Migration & disturbance</div>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4 italic">
            Same rigor we use for exoplanets — applied to the desert outside our window.
          </p>
        </div>
      </section>
    </div>
  );
}
