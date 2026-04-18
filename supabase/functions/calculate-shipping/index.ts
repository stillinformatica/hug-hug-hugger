import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Free shipping calculation - simulated based on distance/region
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { postal_code, items } = await req.json();

    if (!postal_code || typeof postal_code !== "string") {
      return new Response(JSON.stringify({ error: "CEP é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cep = postal_code.replace(/\D/g, "");
    if (cep.length !== 8) {
      return new Response(JSON.stringify({ error: "CEP inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try multiple CEP providers (ViaCEP can be blocked from edge runtime)
    const providers = [
      `https://brasilapi.com.br/api/cep/v2/${cep}`,
      `https://viacep.com.br/ws/${cep}/json/`,
      `https://cep.awesomeapi.com.br/json/${cep}`,
    ];

    let viaCepData: any = null;
    let lastErr: unknown = null;

    for (const url of providers) {
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) continue;
        const j = await r.json();
        viaCepData = {
          logradouro: j.logradouro || j.street || j.address || "",
          bairro: j.bairro || j.neighborhood || j.district || "",
          localidade: j.localidade || j.city || "",
          uf: j.uf || j.state || "",
          erro: j.erro === true || (!j.uf && !j.state),
        };
        if (!viaCepData.erro) break;
      } catch (e) {
        lastErr = e;
        console.warn("CEP provider failed:", url, String(e));
      }
    }

    if (!viaCepData || viaCepData.erro) {
      console.error("All CEP providers failed:", lastErr);
      return new Response(
        JSON.stringify({ error: "CEP não encontrado", fallback: true }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Calculate estimated delivery based on region
    const uf = viaCepData.uf;
    const region = getRegion(uf);

    const shippingOptions = [
      {
        id: "free_shipping",
        name: "Envio Grátis",
        price: 0,
        currency: "BRL",
        estimated_days: getEstimatedDays(region, "standard"),
        description: "Frete grátis para todo o Brasil",
      },
      {
        id: "express_shipping",
        name: "Envio Expresso",
        price: 0,
        currency: "BRL",
        estimated_days: getEstimatedDays(region, "express"),
        description: "Entrega expressa gratuita",
      },
    ];

    return new Response(JSON.stringify({
      postal_code: cep,
      address: {
        street: viaCepData.logradouro,
        neighborhood: viaCepData.bairro,
        city: viaCepData.localidade,
        state: viaCepData.uf,
      },
      shipping_options: shippingOptions,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Shipping calculation error:", error);
    return new Response(JSON.stringify({ error: "Erro ao calcular frete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getRegion(uf: string): string {
  const regions: Record<string, string[]> = {
    sudeste: ["SP", "RJ", "MG", "ES"],
    sul: ["PR", "SC", "RS"],
    nordeste: ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA"],
    centro_oeste: ["GO", "MT", "MS", "DF"],
    norte: ["AM", "PA", "AC", "RO", "RR", "AP", "TO"],
  };
  for (const [region, states] of Object.entries(regions)) {
    if (states.includes(uf)) return region;
  }
  return "sudeste";
}

function getEstimatedDays(region: string, type: string): number {
  const days: Record<string, Record<string, number>> = {
    sudeste: { standard: 5, express: 2 },
    sul: { standard: 7, express: 3 },
    nordeste: { standard: 10, express: 5 },
    centro_oeste: { standard: 8, express: 4 },
    norte: { standard: 12, express: 6 },
  };
  return days[region]?.[type] || 10;
}
