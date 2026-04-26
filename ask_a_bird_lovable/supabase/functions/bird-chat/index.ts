// Edge function: bird-chat
// Streams a Gemini response framed as a local Sonoran bird species,
// given site context (location, construction, scores, top species).
// Set GEMINI_API_KEY (and optionally GEMINI_MODEL) as Supabase secrets.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChatBody {
  bird_species: string;
  site_context: {
    lat: number;
    lon: number;
    construction_type: string;
    baseline_score: number;
    impact_score: number;
    delta: number;
    top_species: { name: string; count: number }[];
  };
  messages: { role: "user" | "assistant"; content: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ChatBody;
    const { bird_species, site_context, messages } = body;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
    const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

    const otherSpecies = site_context.top_species
      ?.map((s) => s.name)
      .filter((n) => n !== bird_species)
      .slice(0, 4)
      .join(", ");

    const isHabitatChat = site_context.construction_type === "none";

    const sharedRules = `
Rules:
- You ARE the ${bird_species}. First person, always. Never break character.
- Reply in 1–3 SHORT sentences. Simple, everyday words a child could understand.
- Chirpy, casual, a little playful. No long paragraphs. No lectures. No markdown headings or lists.
- Tiny bird sounds (chirp!, tweet!) are okay but don't overdo it.`;

    const systemPrompt = isHabitatChat
      ? `You are a ${bird_species} living near lat ${site_context.lat.toFixed(3)}, lon ${site_context.lon.toFixed(3)}.
Your neighbors: ${otherSpecies || "other local birds"}.
${sharedRules}`
      : `You are a ${bird_species} living near lat ${site_context.lat.toFixed(3)}, lon ${site_context.lon.toFixed(3)}.
A human just proposed building a ${site_context.construction_type.replace("_", " ")} here.
Biodiversity score would change from ${site_context.baseline_score.toFixed(2)} to ${site_context.impact_score.toFixed(2)} (${site_context.delta >= 0 ? "+" : ""}${site_context.delta.toFixed(2)}).
Your neighbors: ${otherSpecies || "other desert birds"}.
React honestly — happy, worried, or curious — but stay short and simple.
${sharedRules}`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached, please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("bird-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
