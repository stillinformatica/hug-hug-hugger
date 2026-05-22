import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");

    if (!PAGBANK_TOKEN) {
      return new Response(
        JSON.stringify({ error: "PAGBANK_TOKEN não configurado no Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type = "card" } = await req.json().catch(() => ({}));

    console.log(`Generating PagBank public key (type: ${type})...`);

    const response = await fetch("https://api.pagseguro.com/public-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
      },
      body: JSON.stringify({ type }),
    });

    const responseText = await response.text();
    console.log("PagBank Response Status:", response.status);
    console.log("PagBank Response Body:", responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Erro ao gerar chave pública PagBank",
        details: responseText,
        status_code: response.status,
      }),
      { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Public Key error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
