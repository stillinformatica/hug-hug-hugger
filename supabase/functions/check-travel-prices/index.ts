const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, title, startDate, endDate, searchDecolar } = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ success: false, error: 'Title is required' }),
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

    let allContent = '';
    let decolarSearchUrl = '';

    // 1. Search Decolar for packages
    if (searchDecolar) {
      const decolarQuery = `${title} pacote ${startDate ? startDate : ''} ${endDate ? endDate : ''}`.trim();
      decolarSearchUrl = `https://www.decolar.com/search/packages?q=${encodeURIComponent(title)}`;

      // Search Decolar via Firecrawl search
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `site:decolar.com ${decolarQuery} preço promoção`,
          limit: 5,
          lang: 'pt-br',
          country: 'br',
          scrapeOptions: { formats: ['markdown'] },
        }),
      });

      const searchData = await searchResponse.json();
      const results = searchData?.data || [];

      if (results.length > 0) {
        decolarSearchUrl = results[0]?.url || decolarSearchUrl;
        allContent += results
          .map((r: { url: string; title: string; markdown?: string }) =>
            `### Decolar: ${r.title} (${r.url})\n${(r.markdown || '').substring(0, 3000)}`
          )
          .join('\n\n');
      }

      // Also try scraping Decolar search page directly
      try {
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `https://www.decolar.com/pacotes/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, '-'))}`,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });
        const scrapeData = await scrapeResponse.json();
        const content = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        if (content) {
          allContent += `\n\n### Decolar Página Direta\n${content.substring(0, 4000)}`;
        }
      } catch (e) {
        console.log('Direct Decolar scrape failed, continuing with search results');
      }
    }

    // 2. If external link provided, also scrape that
    if (url) {
      try {
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });
        const scrapeData = await scrapeResponse.json();
        const content = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        if (content) {
          allContent += `\n\n### Link Externo (${url})\n${content.substring(0, 4000)}`;
        }
      } catch (e) {
        console.log('External link scrape failed');
      }
    }

    if (!allContent) {
      return new Response(
        JSON.stringify({ success: false, found: false, error: 'Nenhum resultado encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Use AI to extract best price
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
            content: `Você analisa resultados de busca da Decolar e outras fontes para encontrar o melhor preço de pacotes de viagem.
Responda APENAS em JSON válido:
{"price": 2999.90, "currency": "BRL", "description": "Pacote all inclusive 5 dias - Decolar", "found": true, "decolarUrl": "https://www.decolar.com/..."}
Se encontrou várias opções, retorne o menor preço.
Se não encontrar preço, coloque found: false e price: null.
Sempre inclua a URL da Decolar mais relevante em decolarUrl.`
          },
          {
            role: 'user',
            content: `Viagem: ${title}\nDatas: ${startDate || 'não definida'} a ${endDate || 'não definida'}\n\nConteúdo encontrado:\n${allContent.substring(0, 10000)}`
          }
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiResponse.json();
    const aiText = aiData?.choices?.[0]?.message?.content || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(
        JSON.stringify({
          success: true,
          ...parsed,
          decolarUrl: parsed.decolarUrl || decolarSearchUrl,
          checkedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, found: false, error: 'Não foi possível extrair o preço' }),
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
