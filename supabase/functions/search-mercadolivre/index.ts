const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items } = await req.json();

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

    // Scrape Mercado Livre search pages directly for each item
    const searchPromises = items.slice(0, 8).map(async (item: { name: string; quantity: string }) => {
      const query = encodeURIComponent(item.name);
      const mlUrl = `https://lista.mercadolivre.com.br/${query}`;
      
      try {
        // Scrape the actual ML search results page
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: mlUrl,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 2000,
          }),
        });
        const scrapeData = await scrapeResponse.json();
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        
        console.log(`ML scrape for "${item.name}" (${mlUrl}): ${markdown.length} chars`);
        if (markdown.length > 0) {
          console.log(`ML content preview: ${markdown.substring(0, 500)}`);
        }

        // Also do a web search for pricing info
        const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `"${item.name}" preço reais site:mercadolivre.com.br`,
            limit: 3,
            lang: 'pt-br',
            country: 'br',
            scrapeOptions: { formats: ['markdown'] },
          }),
        });
        const searchData = await searchResponse.json();
        const searchResults = searchData?.data || [];

        return {
          itemName: item.name,
          quantity: item.quantity,
          scrapedContent: markdown.substring(0, 3000),
          searchResults: searchResults,
          searchUrl: mlUrl,
        };
      } catch (err) {
        console.error(`Error searching for ${item.name}:`, err);
        return { itemName: item.name, quantity: item.quantity, scrapedContent: '', searchResults: [], searchUrl: mlUrl };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Combine all results for AI processing
    const combinedContent = searchResults.map(sr => {
      const searchText = sr.searchResults
        .map((r: { url: string; title: string; markdown?: string }) =>
          `URL: ${r.url}\nTítulo: ${r.title}\n${(r.markdown || '').substring(0, 1500)}`
        )
        .join('\n---\n');
      return `## Item: ${sr.quantity}x ${sr.itemName}\nURL de busca: ${sr.searchUrl}\n\n### Página de resultados ML:\n${sr.scrapedContent || 'Sem conteúdo'}\n\n### Resultados de busca web:\n${searchText || 'Nenhum resultado'}`;
    }).join('\n\n===\n\n');

    // Use AI to extract structured product data
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
            content: `Você é um assistente especialista em extrair dados de produtos do Mercado Livre a partir de conteúdo scrapeado.

Responda APENAS em JSON válido no formato:
{
  "products": [
    {
      "itemName": "nome do item da lista",
      "quantity": "quantidade solicitada",
      "productTitle": "título do produto encontrado",
      "price": 12.99,
      "url": "https://www.mercadolivre.com.br/...",
      "found": true
    }
  ],
  "estimatedTotal": 45.90
}

REGRAS CRÍTICAS:
- Analise o conteúdo scrapeado procurando por padrões de preço: "R$", "R$ XX,XX", "por R$", "a partir de R$", números seguidos de "reais"
- O conteúdo markdown do Mercado Livre geralmente contém preços no formato "R$ XX" ou "R$XX,XX" ou "XXreais" ou "XX reaisXX centavos"
- Converta preços brasileiros (vírgula como decimal) para número: "29,90" → 29.90
- Se encontrar múltiplos preços para um item, escolha o mais relevante (produto unitário, não kit/atacado)
- NUNCA invente preços. Se não encontrar preço real no texto, coloque price: null
- Use a URL específica do produto quando disponível, senão use a URL de busca fornecida
- Se o item foi encontrado mas sem preço, coloque found: true e price: null
- Se o item NÃO foi encontrado de forma alguma, coloque found: false
- estimatedTotal = soma dos (price * quantidade numérica) dos itens com preço real`
          },
          {
            role: 'user',
            content: `Extraia os produtos e preços reais do conteúdo abaixo:\n\n${combinedContent.substring(0, 20000)}`
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
