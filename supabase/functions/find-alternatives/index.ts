const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemName, marketUrl, marketName } = await req.json();

    if (!itemName || !marketUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item name and market URL are required' }),
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

    // Search the market site for the product
    const hostname = new URL(marketUrl).hostname;

    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `site:${hostname} ${itemName}`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    const searchData = await searchResponse.json();
    const results = searchData?.data || [];
    const combinedContent = results.map((r: any) => r.markdown || r.description || '').join('\n\n').substring(0, 6000);

    if (!combinedContent) {
      // Fallback: use AI to suggest alternatives without scraping
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            {
              role: 'system',
              content: `Você é um assistente de compras brasileiro. Sugira 3-5 produtos alternativos (marcas diferentes) para o item solicitado. Responda APENAS em JSON válido:
{"alternatives": [{"name": "Nome completo do produto", "brand": "Marca", "reason": "Por que é uma boa alternativa"}]}`
            },
            { role: 'user', content: `Sugira alternativas para: ${itemName}` }
          ],
          temperature: 0.3,
        }),
      });

      const aiData = await aiResponse.json();
      const aiText = aiData?.choices?.[0]?.message?.content || '';
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(
          JSON.stringify({ success: true, alternatives: parsed.alternatives || [], source: 'ai' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível encontrar alternativas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use AI to extract alternative products from scraped content
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `Você é um extrator de produtos de supermercado. Analise o conteúdo do site e encontre produtos similares/alternativos ao item solicitado, de marcas diferentes.
Responda APENAS em JSON válido:
{"alternatives": [{"name": "Nome completo do produto", "brand": "Marca", "price": 9.99, "reason": "Por que é alternativa"}]}
Se não encontrar preço, coloque price: null. Liste até 5 alternativas.`
          },
          {
            role: 'user',
            content: `Produto original: ${itemName}\nMercado: ${marketName || hostname}\n\nConteúdo encontrado:\n${combinedContent}`
          }
        ],
        temperature: 0.2,
      }),
    });

    const aiData = await aiResponse.json();
    const aiText = aiData?.choices?.[0]?.message?.content || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(
        JSON.stringify({ success: true, alternatives: parsed.alternatives || [], source: 'scraping' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Não foi possível extrair alternativas' }),
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
