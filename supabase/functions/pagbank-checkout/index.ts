import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// PagBank Checkout API (Bearer token)
const PAGBANK_API_URL = "https://api.pagseguro.com/checkouts";

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

    // Montar payload do Checkout API
    const checkoutPayload: Record<string, unknown> = {
      reference_id: referenceId,
      customer_modifiable: true,
      amount: {
        value: totalAmount,
        currency: "BRL",
      },
      payment_methods: [
        { type: "CREDIT_CARD" },
        { type: "DEBIT_CARD" },
        { type: "BOLETO" },
        { type: "PIX" },
      ],
      payment_methods_configs: [
        {
          type: "CREDIT_CARD",
          config_options: [
            { option: "INSTALLMENTS_LIMIT", value: "12" },
          ],
        },
      ],
      soft_descriptor: "STILLINF",
      items: items.map(
        (
          item: { name: string; quantity: number; unit_amount: number; reference_id?: string },
          index: number
        ) => ({
          reference_id: item.reference_id || `ITEM_${index + 1}`,
          name: item.name,
          quantity: item.quantity,
          unit_amount: Math.round(item.unit_amount * 100),
        })
      ),
      redirect_url: "https://hug-hug-hugger.lovable.app/?payment=success",
      return_url: "https://hug-hug-hugger.lovable.app/",
      notification_urls: [
        "https://hug-hug-hugger.lovable.app/api/pagbank-webhook",
      ],
    };

    // Adicionar dados do cliente se fornecidos
    if (customer) {
      (checkoutPayload as Record<string, unknown>).customer = {
        name: customer?.name || "Cliente",
        email: customer?.email || "cliente@email.com",
        tax_id: customer?.tax_id || "12345678909",
        phones: customer?.phone
          ? [
              {
                country: "55",
                area: customer.phone.substring(0, 2),
                number: customer.phone.substring(2),
                type: "MOBILE",
              },
            ]
          : [],
      };
    }

    console.log("Creating PagBank checkout");
    console.log("Payload:", JSON.stringify(checkoutPayload).substring(0, 500));

    const response = await fetch(PAGBANK_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(checkoutPayload),
    });

    const responseText = await response.text();
    console.log("PagBank response status:", response.status);
    console.log("PagBank response:", responseText.substring(0, 1000));

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar checkout", details: responseText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutData = JSON.parse(responseText);

    // Extrair link de pagamento da resposta
    let paymentUrl = "";
    
    if (checkoutData.links) {
      const payLink = checkoutData.links.find(
        (l: { rel: string; href: string }) =>
          l.rel === "PAY" || l.rel === "pay" || l.rel === "REDIRECT"
      );
      if (payLink) paymentUrl = payLink.href;
    }

    console.log("Payment URL found:", paymentUrl);
    console.log("Checkout ID:", checkoutData.id);

    return new Response(
      JSON.stringify({
        checkout_id: checkoutData.id,
        payment_url: paymentUrl,
        reference_id: referenceId,
        status: checkoutData.status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
