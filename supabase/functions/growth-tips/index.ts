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
            content: `Você é um mentor de sucesso financeiro e desenvolvimento pessoal. Hoje é ${dateStr} (dia ${dayOfYear} do ano).

Gere conteúdo ÚNICO e prático para hoje sobre prosperidade, sucesso e liberdade financeira.

Responda EXATAMENTE neste formato JSON (sem markdown, sem code blocks):
{
  "dailyPhrase": "Uma frase motivacional poderosa e original sobre sucesso, prosperidade ou mentalidade vencedora.",
  "financeTip": "Uma dica prática e específica sobre finanças pessoais, economia ou investimentos que possa ser aplicada HOJE.",
  "financeTipTitle": "Título curto da dica financeira (3-5 palavras)",
  "successHabit": "Um hábito ou atitude de pessoas bem-sucedidas para praticar hoje.",
  "successHabitTitle": "Título curto do hábito (3-5 palavras)",
  "debtTip": "Uma dica específica sobre como evitar dívidas, sair de dívidas ou gerenciar melhor o dinheiro.",
  "debtTipTitle": "Título curto da dica sobre dívidas (3-5 palavras)",
  "reflection": "Uma reflexão curta sobre crescimento pessoal e financeiro para meditar hoje.",
  "category": "Uma das categorias: finanças, mentalidade, disciplina, investimentos, produtividade, liderança"
}

REGRAS:
- Cada conteúdo deve ser ÚNICO e nunca repetido
- Use o dia do ano como semente criativa para variar os temas
- Seja específico e prático, evite clichês genéricos
- Escreva em português brasileiro
- Inclua números, porcentagens ou exemplos reais quando possível
- Foque em ações que qualquer pessoa pode tomar imediatamente`
          },
          {
            role: "user",
            content: `Gere o conteúdo de evolução pessoal e financeira para hoje, dia ${dayOfYear} do ano. Seja criativo e prático.`
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
        dailyPhrase: "O sucesso é construído um dia de cada vez, com disciplina e foco.",
        financeTip: "Revise seus gastos do último mês e identifique pelo menos um corte possível.",
        financeTipTitle: "Revise seus gastos",
        successHabit: "Dedique 15 minutos hoje para planejar sua semana.",
        successHabitTitle: "Planeje sua semana",
        debtTip: "Antes de comprar algo, espere 24 horas para decidir se realmente precisa.",
        debtTipTitle: "Regra das 24 horas",
        reflection: "Prosperidade começa com as pequenas decisões de cada dia.",
        category: "finanças"
      };
    }

    return new Response(JSON.stringify({ ...parsed, date: dateStr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("growth-tips error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
