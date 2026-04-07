import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_BASE_URL = "https://sandbox.api.pagseguro.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");

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

    // Build order payload for PagBank API v4
    const orderItems = items.map((item: { name: string; quantity: number; unit_amount: number }, index: number) => ({
      reference_id: `item_${index + 1}`,
      name: item.name.substring(0, 64),
      quantity: item.quantity,
      unit_amount: Math.round(item.unit_amount * 100), // API v4 uses cents
    }));

    const totalAmount = orderItems.reduce(
      (sum: number, item: { unit_amount: number; quantity: number }) => sum + item.unit_amount * item.quantity,
      0
    );

    const orderPayload: Record<string, unknown> = {
      reference_id: referenceId,
      items: orderItems,
      notification_urls: [
        "https://hug-hug-hugger.lovable.app/api/pagbank-webhook"
      ],
    };

    // Add customer if provided
    if (customer) {
      const customerData: Record<string, unknown> = {};
      if (customer.name) customerData.name = customer.name.substring(0, 50);
      if (customer.email) customerData.email = customer.email;
      if (customer.tax_id) {
        customerData.tax_id = customer.tax_id.replace(/\D/g, "");
      }
      if (customer.phone) {
        const cleanPhone = customer.phone.replace(/\D/g, "");
        customerData.phones = [{
          country: 55,
          area: parseInt(cleanPhone.substring(0, 2)),
          number: parseInt(cleanPhone.substring(2)),
          type: "MOBILE",
        }];
      }
      orderPayload.customer = customerData;
    }

    // Add shipping if provided
    if (shipping) {
      orderPayload.shipping = {
        address: {
          street: shipping.street || "",
          number: shipping.number || "S/N",
          complement: shipping.complement || "",
          locality: shipping.locality || "",
          city: shipping.city || "",
          region_code: shipping.region_code || "",
          country: "BRA",
          postal_code: shipping.postal_code?.replace(/\D/g, "") || "",
        },
      };
    }

    // Add checkout redirect URLs
    orderPayload.charges = [{
      reference_id: referenceId,
      description: `Pedido ${referenceId}`,
      amount: {
        value: totalAmount,
        currency: "BRL",
      },
      payment_method: {
        type: "CHECKOUT",
        checkout: {
          redirect_urls: {
            return_url: "https://hug-hug-hugger.lovable.app/?payment=success",
          },
        },
      },
    }];

    console.log("Calling PagBank API v4 /checkouts...");
    console.log("Token length:", PAGBANK_TOKEN?.length, "Token prefix:", PAGBANK_TOKEN?.substring(0, 6));

    // Try /checkouts endpoint first (simplified checkout)
    const checkoutPayload = {
      reference_id: referenceId,
      expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '-03:00'),
      customer_modifiable: true,
      items: orderItems,
      additional_amount: 0,
      discount_amount: 0,
      payment_methods: [
        { type: "CREDIT_CARD" },
        { type: "DEBIT_CARD" },
        { type: "BOLETO" },
        { type: "PIX" },
      ],
      payment_methods_configs: [{
        type: "CREDIT_CARD",
        config_options: [{
          option: "INSTALLMENTS_LIMIT",
          value: "12",
        }],
      }],
      redirect_urls: {
        return_url: "https://hug-hug-hugger.lovable.app/?payment=success",
        back_url: "https://hug-hug-hugger.lovable.app/?payment=cancelled",
      },
      notification_urls: [
        "https://hug-hug-hugger.lovable.app/api/pagbank-webhook"
      ],
      payment_notification_urls: [
        "https://hug-hug-hugger.lovable.app/api/pagbank-webhook"
      ],
    };

    console.log("Checkout payload:", JSON.stringify(checkoutPayload).substring(0, 500));

    const response = await fetch(`${PAGBANK_BASE_URL}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
        "x-api-version": "4.0",
      },
      body: JSON.stringify(checkoutPayload),
    });

    const responseText = await response.text();
    console.log("PagBank response status:", response.status);
    console.log("PagBank response:", responseText.substring(0, 1000));

    if (response.ok) {
      const data = JSON.parse(responseText);
      
      // The checkout response contains links with the payment URL
      const paymentLink = data.links?.find((l: { rel: string }) => l.rel === "PAY");
      const paymentUrl = paymentLink?.href || `https://sandbox.pagseguro.uol.com.br/v2/checkout/payment.html?code=${data.id}`;

      return new Response(
        JSON.stringify({
          id: data.id,
          payment_url: paymentUrl,
          reference_id: referenceId,
          status: "CREATED",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Erro no checkout PagBank",
        details: responseText.substring(0, 500),
        status_code: response.status,
      }),
      { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
