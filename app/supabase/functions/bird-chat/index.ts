// Edge function: bird-chat
// Streams a Gemini/Gemma response framed as a local Sonoran bird species.
// Uses the native Gemini generateContent endpoint (not the OpenAI-compatible
// proxy) and converts the response to OpenAI SSE format so the frontend
// BirdChat.tsx parser is unchanged.
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
    const MODEL = Deno.env.get("GEMINI_MODEL");
    if (!MODEL) throw new Error("GEMINI_MODEL is not configured");

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

    // Convert chat history to Gemini contents format.
    // Gemini uses "model" instead of "assistant" and requires alternating roles.
    // Do NOT filter by hidden — the hidden flag is UI-only. The auto-opener prompt
    // must reach the model so it can respond to it.
    const contents = messages
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 2048, temperature: 0.9 },
        }),
      },
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("Gemini error:", geminiResp.status, errText);
      if (geminiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Gemini API error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert Gemini SSE → OpenAI SSE so BirdChat.tsx needs no changes.
    const readable = new ReadableStream({
      async start(controller) {
        const reader = geminiResp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const enc = new TextEncoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const json = trimmed.slice(6).trim();
            if (!json) continue;
            try {
              const parsed = JSON.parse(json);
              // Filter out thinking parts (thought:true) — only stream actual output.
              const parts: { text?: string; thought?: boolean }[] =
                parsed.candidates?.[0]?.content?.parts ?? [];
              const text = parts
                .filter((p) => !p.thought && p.text)
                .map((p) => p.text)
                .join("");
              if (text) {
                const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
                controller.enqueue(enc.encode(chunk));
              }
              if (parsed.candidates?.[0]?.finishReason === "STOP") {
                controller.enqueue(enc.encode("data: [DONE]\n\n"));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("bird-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
