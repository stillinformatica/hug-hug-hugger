import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { wifeName } = await req.json();

    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const dateStr = today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um conselheiro matrimonial carinhoso e criativo. Hoje é ${dateStr} (dia ${dayOfYear} do ano).
            
Sua tarefa é gerar conteúdo ÚNICO para hoje para um marido que quer valorizar sua esposa${wifeName ? ` chamada ${wifeName}` : ""}.

Responda EXATAMENTE neste formato JSON (sem markdown, sem code blocks):
{
  "dailyPhrase": "Uma frase romântica e poética única para hoje, exaltando a esposa. Deve ser original, tocante e diferente a cada dia.",
  "tip": "Uma dica prática e específica de como valorizar a esposa hoje. Algo que ele possa fazer HOJE.",
  "tipTitle": "Título curto da dica (3-5 palavras)",
  "compliment": "Um elogio sincero e específico para dizer à esposa hoje.",
  "activity": "Uma atividade ou gesto romântico para fazer hoje como casal.",
  "activityTitle": "Título curto da atividade (3-5 palavras)",
  "reflection": "Uma reflexão curta sobre amor e casamento para meditar hoje.",
  "category": "Uma das categorias: romance, gratidão, parceria, admiração, cumplicidade, carinho"
}

REGRAS:
- Cada frase deve ser ÚNICA e nunca repetida
- Use o dia do ano como semente criativa para variar os temas
- Seja específico, evite clichês genéricos
- Escreva em português brasileiro
- As frases devem ser profundas mas acessíveis
- Inclua referências sazonais quando apropriado`
          },
          {
            role: "user",
            content: `Gere o conteúdo matrimonial para hoje, dia ${dayOfYear} do ano. Seja criativo e único.`
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições, tente novamente em breve." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Parse error, raw:", content);
      parsed = {
        dailyPhrase: "Cada dia ao seu lado é um presente que o universo me deu.",
        tip: "Surpreenda-a com um gesto simples hoje.",
        tipTitle: "Gesto de carinho",
        compliment: "Você é incrível em tudo que faz.",
        activity: "Assistam juntos algo que ela goste.",
        activityTitle: "Momento a dois",
        reflection: "Amar é escolher estar junto todos os dias.",
        category: "romance"
      };
    }

    return new Response(JSON.stringify({ ...parsed, date: dateStr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("marriage-tips error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
