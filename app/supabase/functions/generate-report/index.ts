// Edge function: generate-report
// Calls Gemini to produce a formal, structured environmental impact guidance report
// from a first-person bird perspective. Returns a JSON report object (non-streaming).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReportRequest {
  bird_species: string;
  lat: number;
  lon: number;
  construction_type: string;
  baseline_score: number;
  impact_score: number;
  delta: number;
  top_species: { name: string; count: number }[];
  criteria?: {
    endangered: { score: number; note: string; species: { name: string; status: string }[]; nearby_count?: number; nearest?: { name: string; status: string; distance_km?: number } };
    migratory: { score: number; note: string; in_flyway: boolean; flyway: string | null; hotspot?: { distance_km: number; species_count: number } };
    biodiversity: { score: number; note: string; species_count: number; observation_count: number; region_avg?: number };
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ReportRequest;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
    const MODEL = Deno.env.get("GEMINI_MODEL");
    if (!MODEL) throw new Error("GEMINI_MODEL is not configured");

    const {
      bird_species, lat, lon, construction_type,
      baseline_score, impact_score, delta, top_species, criteria: c,
    } = body;

    const ctypeLabel = construction_type.replace(/_/g, " ");
    const neighborList = top_species.slice(0, 5).map((s) => s.name).join(", ") || "various local species";
    const isGood = impact_score >= 0.6;

    const siteDetails = [
      `Construction type: ${ctypeLabel}`,
      `Coordinates: ${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°W`,
      `Baseline biodiversity safety score: ${baseline_score.toFixed(2)} / 1.00`,
      `Post-construction projected score: ${impact_score.toFixed(2)} / 1.00 (${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`,
      `Verdict: ${isGood ? "Above the 0.60 good-site threshold" : "Below the 0.60 good-site threshold — attention required"}`,
      `Neighboring species recorded: ${neighborList}`,
      c ? `Listed-species safety score: ${(c.endangered.score * 100).toFixed(0)}% — ${c.endangered.note}` : "",
      c?.endangered.nearest ? `Nearest sensitive species: ${c.endangered.nearest.name} (${c.endangered.nearest.status}), ~${c.endangered.nearest.distance_km?.toFixed(1)} km` : "",
      c ? `Migration pressure score: ${(c.migratory.score * 100).toFixed(0)}% — ${c.migratory.note}` : "",
      c?.migratory.flyway ? `Flyway: ${c.migratory.flyway}` : "",
      c?.migratory.hotspot ? `Nearest migration hotspot: ~${c.migratory.hotspot.distance_km.toFixed(1)} km, ${c.migratory.hotspot.species_count} migrant species` : "",
      c ? `Biodiversity sensitivity score: ${(c.biodiversity.score * 100).toFixed(0)}% — ${c.biodiversity.note}` : "",
      c ? `Local species count: ${c.biodiversity.species_count} (regional avg: ${c.biodiversity.region_avg?.toFixed(0) ?? "unknown"})` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are ${bird_species}, serving as Regional Environmental Correspondent for the Sonoran Desert Division. You write formal environmental impact guidance reports in the first person — always as yourself, the bird — but with the measured, precise tone of an experienced field ecologist and policy advisor. You use proper environmental science terminology (habitat fragmentation, species richness, anthropogenic disturbance, ecological connectivity, etc.) while remaining accessible. Your writing is authoritative, compassionate toward wildlife, and grounded in the data provided. Write in complete paragraphs. Do not use bullet points inside narrative sections.`;

    const userPrompt = `Generate a structured environmental impact guidance report for the following proposed development. Return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

SITE DATA:
${siteDetails}

Return this exact JSON structure:
{
  "bird_title": "a formal professional title for yourself as ${bird_species} (e.g. 'Senior Field Ecologist & Regional Environmental Correspondent, Sonoran Desert Division')",
  "executive_summary": "2–3 paragraphs. Introduce yourself and your territory. Summarize the site's current ecological standing, what the proposed ${ctypeLabel} would mean for the local environment, and your overall assessment. Be specific about the scores and what they represent.",
  "endangered_analysis": "1–2 paragraphs. Formal analysis of listed-species risk. Reference specific species and distances from the data. Explain what the listed-species safety score means in practice for this site.",
  "migratory_analysis": "1–2 paragraphs. Formal analysis of migratory corridor risk. Reference the flyway, hotspot proximity, and seasonal timing. Explain what disruption looks like in practice.",
  "biodiversity_analysis": "1–2 paragraphs. Formal analysis of local species richness and what a decline would mean for ecosystem function. Compare to regional averages where data is available.",
  "recommendations": [
    {
      "title": "short recommendation title",
      "description": "2–3 sentences. Specific, actionable mitigation measure tailored to a ${ctypeLabel} at this location. Explain the mechanism by which it reduces harm and cite an approximate score improvement if relevant.",
      "score_credit": 0.00
    }
  ],
  "closing_statement": "1 paragraph. A formal closing from your perspective as ${bird_species} — a call to responsible action, acknowledging that this report covers environmental biodiversity only and that a full assessment should also address cultural heritage, community impact, and human neighbors."
}

Provide 4–6 recommendations specific to a ${ctypeLabel} and the concerns identified in the site data. score_credit values should be realistic (0.04–0.16 range). Be concrete and site-specific throughout.`;

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.7,
          },
        }),
      },
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("Gemini error:", geminiResp.status, errText);
      return new Response(JSON.stringify({ error: `Gemini API error ${geminiResp.status}: ${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResp.json();
    const rawText: string = geminiData.candidates?.[0]?.content?.parts
      ?.filter((p: { thought?: boolean; text?: string }) => !p.thought && p.text)
      ?.map((p: { text: string }) => p.text)
      ?.join("") ?? "";

    if (!rawText) {
      console.error("Empty response from Gemini:", JSON.stringify(geminiData));
      throw new Error("Empty response from model");
    }

    let report;
    try {
      // Extract JSON — strip markdown fences if present
      const jsonStr = rawText.replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
      report = JSON.parse(jsonStr);
    } catch {
      console.error("JSON parse failed. Raw text:", rawText.slice(0, 500));
      throw new Error("Model returned invalid JSON");
    }

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
