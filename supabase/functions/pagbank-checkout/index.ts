import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

    const orderItems = items.map((item: { name: string; quantity: number; unit_amount: number }, index: number) => ({
      reference_id: `item_${index + 1}`,
      name: item.name.substring(0, 64),
      quantity: item.quantity,
      unit_amount: Math.round(item.unit_amount * 100),
    }));

    const totalAmount = orderItems.reduce(
      (sum: number, item: { unit_amount: number; quantity: number }) => sum + item.unit_amount * item.quantity,
      0
    );

    // Webhook URL via edge function
    const webhookUrl = `${SUPABASE_URL}/functions/v1/pagbank-webhook`;

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
        return_url: "https://www.stillinformatica.com.br/?payment=success",
        back_url: "https://www.stillinformatica.com.br/?payment=cancelled",
      },
      notification_urls: [webhookUrl],
      payment_notification_urls: [webhookUrl],
    };

    const payloadJson = JSON.stringify(checkoutPayload);
    console.log("=== PAGBANK CHECKOUT REQUEST ===");
    console.log("URL:", `${PAGBANK_BASE_URL}/checkouts`);
    console.log("Webhook URL:", webhookUrl);
    console.log("Payload:", payloadJson);

    const response = await fetch(`${PAGBANK_BASE_URL}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
        "x-api-version": "4.0",
      },
      body: payloadJson,
    });

    const responseText = await response.text();
    console.log("=== PAGBANK CHECKOUT RESPONSE ===");
    console.log("Status:", response.status);
    console.log("Body:", responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      
      const paymentLink = data.links?.find((l: { rel: string }) => l.rel === "PAY");
      const paymentUrl = paymentLink?.href || `https://pagamento.pagbank.com.br/pagamento?code=${data.id}`;

      // Save order to database
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { error: dbError } = await supabase.from("orders").insert({
          reference_id: referenceId,
          pagbank_id: data.id,
          status: "CREATED",
          customer_name: customer?.name || null,
          customer_email: customer?.email || null,
          total_amount: totalAmount,
          items: items,
          shipping_address: shipping || null,
        });
        if (dbError) console.error("Error saving order:", dbError);
        else console.log("Order saved:", referenceId);
      }

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
        details: responseText,
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
