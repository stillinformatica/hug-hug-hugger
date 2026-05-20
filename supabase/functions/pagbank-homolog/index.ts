import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    const referenceId = "HOMOLOG_" + Date.now();
    
    const checkoutPayload = {
      reference_id: referenceId,
      expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\\.\\d{3}Z$/, "-03:00"),
      customer_modifiable: true,
      items: [{
        reference_id: "homolog_item_1",
        name: "Produto para Homologacao",
        quantity: 1,
        unit_amount: 1000,
      }],
      customer: {
        name: "Cliente Teste Homologacao",
        email: "teste@stillinformatica.com.br",
        tax_id: "12345678909",
        phones: [{
          country: "55",
          area: "11",
          number: "999999999",
          type: "MOBILE"
        }]
      },
      payment_methods: [
        { type: "CREDIT_CARD" },
        { type: "DEBIT_CARD" },
        { type: "BOLETO" },
        { type: "PIX" },
      ],
      redirect_urls: {
        return_url: "https://www.stillinformatica.com.br/?payment=success",
        back_url: "https://www.stillinformatica.com.br/?payment=cancelled",
      }
    };

    const response = await fetch("https://sandbox.api.pagseguro.com/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + PAGBANK_TOKEN,
        "x-api-version": "4.0",
      },
      body: JSON.stringify(checkoutPayload),
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({ request: checkoutPayload, response: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
