import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// PagBank API moderna - tenta múltiplos endpoints
const PAGBANK_BASE_URL = "https://ws.sandbox.pagbank.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");

    console.log("Token:", PAGBANK_TOKEN ? `${PAGBANK_TOKEN.substring(0, 8)}... (length: ${PAGBANK_TOKEN.length})` : "NOT SET");

    if (!PAGBANK_TOKEN) {
      return new Response(
        JSON.stringify({ error: "PAGBANK_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { items, customer, shipping } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Items são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const referenceId = `ORDER_${Date.now()}`;

    // Calcular valor total em centavos
    const totalAmount = items.reduce(
      (sum: number, item: { unit_amount: number; quantity: number }) =>
        sum + Math.round(item.unit_amount * 100) * item.quantity,
      0
    );

    const authHeaders = {
      "Authorization": `Bearer ${PAGBANK_TOKEN}`,
      "Content-Type": "application/json",
    };

    const itemsPayload = items.map(
      (
        item: { name: string; quantity: number; unit_amount: number; reference_id?: string },
        index: number
      ) => ({
        reference_id: item.reference_id || `ITEM_${index + 1}`,
        name: item.name.substring(0, 65),
        quantity: item.quantity,
        unit_amount: Math.round(item.unit_amount * 100),
      })
    );

    const customerPayload = customer
      ? {
          name: (customer.name || "Cliente").substring(0, 30),
          email: customer.email || "cliente@email.com",
          tax_id: (customer.tax_id || "12345678909").replace(/\D/g, ""),
          phones: customer.phone
            ? [
                {
                  country: "55",
                  area: customer.phone.substring(0, 2),
                  number: customer.phone.substring(2, 11),
                  type: "MOBILE",
                },
              ]
            : [],
        }
      : undefined;

    // Estratégia: tentar /checkouts primeiro, depois /orders
    const endpoints = [
      {
        name: "checkouts",
        url: `${PAGBANK_BASE_URL}/checkouts`,
        payload: {
          reference_id: referenceId,
          customer_modifiable: true,
          amount: { value: totalAmount, currency: "BRL" },
          payment_methods: [
            { type: "CREDIT_CARD" },
            { type: "DEBIT_CARD" },
            { type: "BOLETO" },
            { type: "PIX" },
          ],
          payment_methods_configs: [
            {
              type: "CREDIT_CARD",
              config_options: [{ option: "INSTALLMENTS_LIMIT", value: "12" }],
            },
          ],
          soft_descriptor: "STILLINF",
          items: itemsPayload,
          ...(customerPayload ? { customer: customerPayload } : {}),
          redirect_url: "https://hug-hug-hugger.lovable.app/?payment=success",
          return_url: "https://hug-hug-hugger.lovable.app/",
          notification_urls: ["https://hug-hug-hugger.lovable.app/api/pagbank-webhook"],
        },
      },
      {
        name: "orders",
        url: `${PAGBANK_BASE_URL}/orders`,
        payload: {
          reference_id: referenceId,
          ...(customerPayload ? { customer: customerPayload } : {}),
          items: itemsPayload,
          qr_codes: [
            {
              amount: { value: totalAmount },
              expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
          shipping: shipping
            ? {
                address: {
                  street: shipping.street || "",
                  number: shipping.number || "S/N",
                  complement: shipping.complement || "",
                  locality: shipping.locality || "",
                  city: shipping.city || "",
                  region_code: shipping.region_code || "",
                  country: "BRA",
                  postal_code: (shipping.postal_code || "").replace(/\D/g, ""),
                },
              }
            : undefined,
          notification_urls: ["https://hug-hug-hugger.lovable.app/api/pagbank-webhook"],
        },
      },
    ];

    let lastError = "";
    for (const endpoint of endpoints) {
      console.log(`Trying PagBank ${endpoint.name}...`);
      console.log("Payload:", JSON.stringify(endpoint.payload).substring(0, 500));

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(endpoint.payload),
      });

      const responseText = await response.text();
      console.log(`${endpoint.name} response status:`, response.status);
      console.log(`${endpoint.name} response:`, responseText.substring(0, 1000));

      if (response.ok) {
        const data = JSON.parse(responseText);

        // Extrair link de pagamento
        let paymentUrl = "";
        if (data.links) {
          const payLink = data.links.find(
            (l: { rel: string; href: string }) =>
              l.rel === "PAY" || l.rel === "pay" || l.rel === "REDIRECT"
          );
          if (payLink) paymentUrl = payLink.href;
        }

        // Fallback: QR code link
        if (!paymentUrl && data.qr_codes?.[0]?.links) {
          const qrLink = data.qr_codes[0].links.find(
            (l: { rel: string }) => l.rel === "PAY" || l.rel === "pay"
          );
          if (qrLink) paymentUrl = qrLink.href;
        }

        // Fallback: QR code text (para PIX)
        const pixCode = data.qr_codes?.[0]?.text || null;

        console.log("Payment URL found:", paymentUrl);
        console.log("PIX code:", pixCode ? "present" : "none");
        console.log("Response ID:", data.id);

        return new Response(
          JSON.stringify({
            id: data.id,
            payment_url: paymentUrl,
            pix_code: pixCode,
            reference_id: referenceId,
            status: data.status,
            endpoint_used: endpoint.name,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      lastError = responseText;
      console.log(
        `${endpoint.name} failed (${response.status}), trying next...`
      );
    }

    // Todos os endpoints falharam
    return new Response(
      JSON.stringify({
        error: "Nenhum endpoint do PagBank aceitou a requisição",
        details: lastError,
        help: "Sua conta PagBank pode precisar de liberação. Entre em contato com o suporte PagBank e solicite acesso à API de Checkout/Orders em produção.",
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
