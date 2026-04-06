const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, address } = await req.json();

    if (!items?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'Items are required' }),
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

    const itemNames = items.map((i: { name: string; quantity: string }) => `${i.quantity}x ${i.name}`).join(', ');
    const addressText = address || '';

    // Extract city/neighborhood from address for better search
    const cityMatch = addressText.match(/,\s*([^/,]+)\s*\//);
    const neighborhoodMatch = addressText.match(/,\s*([^,]+),\s*[^/]+\//);
    const city = cityMatch?.[1]?.trim() || '';
    const neighborhood = neighborhoodMatch?.[1]?.trim() || '';

    console.log(`Searching iFood for: ${itemNames}`);
    console.log(`Address: ${addressText}, City: ${city}, Neighborhood: ${neighborhood}`);

    // Search for supermarkets on iFood in the user's area with specific items
    const searches = [
      // Search for specific supermarket + city + items
      `ifood supermercado ${city} ${items.slice(0, 2).map((i: { name: string }) => i.name).join(' ')} preço`,
      // Search for iFood market delivery in the area
      `ifood mercado entrega ${neighborhood} ${city} preços produtos`,
      // Search for specific items prices at supermarkets in the city
      `supermercado ${city} preço ${items.slice(0, 3).map((i: { name: string }) => i.name).join(' ')} delivery ifood`,
    ];

    const searchPromises = searches.map(async (query) => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            limit: 5,
            lang: 'pt-br',
            country: 'br',
            scrapeOptions: { formats: ['markdown'] },
          }),
        });
        const data = await response.json();
        return data?.data || [];
      } catch (err) {
        console.error(`Search error for "${query}":`, err);
        return [];
      }
    });

    const allSearchResults = await Promise.all(searchPromises);
    const results = allSearchResults.flat();

    console.log(`Total search results: ${results.length}`);

    // Combine all scraped content
    const combinedContent = results
      .map((r: { url: string; title: string; markdown?: string }) => {
        const content = (r.markdown || '').substring(0, 2000);
        return `### ${r.title} (${r.url})\n${content}`;
      })
      .join('\n\n---\n\n');

    if (!combinedContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não encontrou mercados no iFood' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Combined content length: ${combinedContent.length}`);

    // Use AI to extract market data
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente que analisa resultados de busca para encontrar supermercados que fazem DELIVERY pelo iFood na região do usuário.

ENDEREÇO DO USUÁRIO: ${addressText}
CIDADE: ${city}
BAIRRO: ${neighborhood}

Responda APENAS em JSON válido no formato:
{
  "markets": [
    {
      "name": "Nome do Supermercado",
      "deliveryFee": 5.99,
      "deliveryTime": "30-50 min",
      "items": [
        {"name": "Arroz 5kg", "price": 24.99, "found": true}
      ],
      "estimatedTotal": 45.90,
      "ifoodUrl": "https://www.ifood.com.br/delivery/cidade/mercado-slug/uuid"
    }
  ]
}

REGRAS CRÍTICAS:
- APENAS inclua supermercados/mercados REAIS que existam na cidade "${city}" e que operem no iFood
- Extraia preços REAIS encontrados no conteúdo scrapeado. NUNCA invente preços.
- Se encontrar o nome de um mercado real mas sem preço dos itens, coloque price: null para cada item e found: true
- Se NÃO encontrar mercados reais na região, retorne: {"markets": []}
- Para ifoodUrl: use a URL real do mercado no iFood se encontrada nos resultados, senão construa: https://www.ifood.com.br/busca?q=NOME_MERCADO
- deliveryFee e deliveryTime: use valores reais se encontrados, senão null
- estimatedTotal: soma dos preços reais encontrados, ou null se nenhum preço real
- Liste até 4 mercados
- NÃO inclua restaurantes, apenas supermercados/mercados
- NÃO invente mercados que não existam`
          },
          {
            role: 'user',
            content: `Itens da lista de compras: ${itemNames}\n\nConteúdo encontrado:\n${combinedContent.substring(0, 15000)}`
          }
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiResponse.json();
    const aiText = aiData?.choices?.[0]?.message?.content || '';

    console.log('AI response preview:', aiText.substring(0, 500));

    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure ifoodSearchUrl exists for backward compat
      if (parsed.markets) {
        parsed.markets = parsed.markets.map((m: any) => ({
          ...m,
          ifoodSearchUrl: m.ifoodUrl || m.ifoodSearchUrl || `https://www.ifood.com.br/busca?q=${encodeURIComponent(m.name)}`,
        }));
      }
      
      return new Response(
        JSON.stringify({ success: true, ...parsed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Não foi possível processar os resultados' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
