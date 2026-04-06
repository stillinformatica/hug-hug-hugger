const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function searchFirecrawl(query: string, apiKey: string): Promise<any[]> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 8,
        lang: "pt-br",
        country: "br",
        tbs: "qdr:m", // last month for freshness
      }),
    });

    if (!response.ok) {
      console.error("Firecrawl search error:", response.status);
      return [];
    }

    const data = await response.json();
    return data?.data || [];
  } catch (e) {
    console.error("Firecrawl error:", e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { preferences } = await req.json();
    const { bands, activities, interests, city } = preferences || {};

    const allPrefs: string[] = [];
    if (bands?.length) allPrefs.push(...bands);
    if (activities?.length) allPrefs.push(...activities);
    if (interests?.length) allPrefs.push(...interests);

    if (allPrefs.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const location = city || "Brasil";

    // Build search queries based on preferences
    const searchQueries: string[] = [];
    
    if (bands?.length) {
      // Search for shows/concerts for each band
      for (const band of bands.slice(0, 3)) {
        searchQueries.push(`show ${band} 2026 ${location} ingressos`);
      }
    }
    
    if (activities?.length) {
      searchQueries.push(`melhores ${activities.join(" ")} ${location} 2026`);
    }

    if (interests?.length) {
      searchQueries.push(`${interests.join(" ")} eventos ${location} 2026`);
    }

    // If few queries, add a general one
    if (searchQueries.length < 2) {
      searchQueries.push(`eventos shows passeios ${location} 2026 próximos`);
    }

    // Search in parallel (max 3 queries)
    const searchPromises = searchQueries.slice(0, 3).map(q => searchFirecrawl(q, FIRECRAWL_API_KEY));
    const searchResults = await Promise.all(searchPromises);
    const allResults = searchResults.flat();

    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [], message: "Nenhum resultado encontrado na busca." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format search results for AI processing
    const resultsText = allResults
      .filter(r => r.url && r.title)
      .map((r, i) => `${i + 1}. Título: ${r.title}\nURL: ${r.url}\nDescrição: ${r.description || "N/A"}`)
      .join("\n\n");

    const prompt = `Você é um curador de eventos e experiências. Analise os resultados de busca abaixo e selecione os 4-6 MELHORES e mais relevantes para alguém com estes gostos:
- Bandas/artistas: ${bands?.join(", ") || "N/A"}
- Passeios: ${activities?.join(", ") || "N/A"}  
- Interesses: ${interests?.join(", ") || "N/A"}
- Localização: ${location}

RESULTADOS DA BUSCA:
${resultsText}

REGRAS IMPORTANTES:
1. Use APENAS eventos/links dos resultados acima - NÃO invente nada
2. O "link" DEVE ser a URL exata do resultado de busca
3. Classifique cada item como: Show, Passeio, Festival, Experiência ou Evento
4. Escreva uma descrição curta e atrativa (2-3 frases) baseada na descrição do resultado
5. Se um resultado não for relevante, ignore-o

Responda APENAS um JSON válido:
{
  "suggestions": [
    {
      "title": "Nome do evento/experiência",
      "description": "Descrição curta e atrativa",
      "type": "Show" | "Passeio" | "Festival" | "Experiência" | "Evento",
      "link": "URL exata do resultado de busca"
    }
  ]
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      
      // Fallback: return raw search results without AI formatting
      const fallbackSuggestions = allResults
        .filter(r => r.url && r.title)
        .slice(0, 6)
        .map(r => ({
          title: r.title,
          description: r.description || "",
          type: "Evento",
          link: r.url,
        }));
      
      return new Response(
        JSON.stringify({ suggestions: fallbackSuggestions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { suggestions: [] };
    }

    // Filter out any suggestions without links
    const validSuggestions = (parsed.suggestions || []).filter(
      (s: any) => s.link && s.link.startsWith("http")
    );

    return new Response(
      JSON.stringify({ suggestions: validSuggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ suggestions: [], error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
