import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGBANK_API_URL = "https://api.pagseguro.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    console.log("Token loaded:", PAGBANK_TOKEN ? `${PAGBANK_TOKEN.substring(0, 10)}... (length: ${PAGBANK_TOKEN.length})` : "NOT SET");
    if (!PAGBANK_TOKEN) {
      return new Response(JSON.stringify({ error: "PAGBANK_TOKEN não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { items, customer, shipping } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Items são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const referenceId = `ORDER_${Date.now()}`;

    // Build PagBank checkout payload
    const checkoutPayload: Record<string, unknown> = {
      reference_id: referenceId,
      customer: customer ? {
        name: customer.name,
        email: customer.email,
        tax_id: customer.tax_id,
        phones: customer.phone ? [{
          country: "55",
          area: customer.phone.substring(0, 2),
          number: customer.phone.substring(2),
          type: "MOBILE",
        }] : undefined,
      } : undefined,
      items: items.map((item: { name: string; quantity: number; unit_amount: number; reference_id?: string }) => ({
        reference_id: item.reference_id || referenceId,
        name: item.name,
        quantity: item.quantity,
        unit_amount: Math.round(item.unit_amount * 100), // PagBank expects cents
      })),
      shipping: shipping ? {
        address: {
          street: shipping.street,
          number: shipping.number,
          complement: shipping.complement || "",
          locality: shipping.locality,
          city: shipping.city,
          region_code: shipping.region_code,
          country: "BRA",
          postal_code: shipping.postal_code,
        },
      } : undefined,
      payment_methods: [
        { type: "PIX" },
        { type: "CREDIT_CARD" },
        { type: "DEBIT_CARD" },
        { type: "BOLETO" },
      ],
      payment_methods_configs: [
        {
          type: "CREDIT_CARD",
          config_options: [
            { option: "INSTALLMENTS_LIMIT", value: "12" },
          ],
        },
      ],
    };

    console.log("Creating PagBank checkout:", JSON.stringify(checkoutPayload));

    const response = await fetch(`${PAGBANK_API_URL}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PAGBANK_TOKEN}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("PagBank error:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "Erro ao criar checkout", details: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract payment link from response
    const paymentLink = data.links?.find(
      (l: { rel: string; href: string }) => l.rel === "PAY"
    )?.href;

    return new Response(JSON.stringify({
      checkout_id: data.id,
      payment_url: paymentLink || null,
      reference_id: referenceId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(JSON.stringify({ error: "Erro interno no servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
