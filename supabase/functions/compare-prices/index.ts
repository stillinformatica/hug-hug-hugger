const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function searchItemsOnMarket(
  items: { name: string; quantity: string }[],
  market: { name: string; url: string },
  firecrawlKey: string,
  lovableKey: string
) {
  const hostname = new URL(market.url).hostname;

  // Search for each item individually on the market site
  const itemResults = await Promise.all(
    items.map(async (item) => {
      try {
        const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:${hostname} ${item.name} preço`,
            limit: 3,
            lang: 'pt-br',
            country: 'br',
          }),
        });

        if (!searchResponse.ok) {
          console.error(`Search failed for ${item.name} on ${market.name}: ${searchResponse.status}`);
          return { name: item.name, price: null, found: false };
        }

        const searchData = await searchResponse.json();
        const results = searchData?.data || [];

        if (results.length === 0) {
          return { name: item.name, price: null, found: false };
        }

        // Combine search results text for AI extraction
        const resultsText = results
          .map((r: any) => `${r.title || ''} - ${r.description || ''}`)
          .join('\n');

        // Use AI to extract the best price
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              {
                role: 'user',
                content: `Extraia o preço do produto "${item.name}" dos resultados abaixo. Responda APENAS um JSON: {"price": 9.99, "found": true} ou {"price": null, "found": false} se não encontrar.

Resultados:
${resultsText.substring(0, 2000)}`
              }
            ],
            temperature: 0.0,
            response_format: { type: 'json_object' },
          }),
        });

        if (!aiResponse.ok) {
          return { name: item.name, price: null, found: false };
        }

        const aiData = await aiResponse.json();
        const aiText = aiData?.choices?.[0]?.message?.content || '';
        const jsonMatch = aiText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { name: item.name, price: parsed.price ?? null, found: !!parsed.found };
        }

        return { name: item.name, price: null, found: false };
      } catch (err) {
        console.error(`Error searching ${item.name} on ${market.name}:`, err);
        return { name: item.name, price: null, found: false };
      }
    })
  );

  const foundItems = itemResults.filter(i => i.found && i.price != null);
  const total = foundItems.length > 0 ? foundItems.reduce((sum, i) => sum + (i.price || 0), 0) : null;

  return {
    market: market.name,
    url: market.url,
    items: itemResults,
    total,
    error: foundItems.length === 0 ? 'Nenhum item encontrado neste mercado' : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, marketUrls } = await req.json();

    if (!items?.length || !marketUrls?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'Items and market URLs are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each market in parallel, searching items individually
    const marketResults = await Promise.all(
      marketUrls.map((market: { name: string; url: string }) =>
        searchItemsOnMarket(items, market, firecrawlKey, lovableKey)
      )
    );

    return new Response(
      JSON.stringify({ success: true, results: marketResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
