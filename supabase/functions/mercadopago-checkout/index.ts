import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MP_BASE_URL = "https://api.mercadopago.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MP_TOKEN) {
      return new Response(
        JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isTestToken = MP_TOKEN.startsWith("TEST-");
    console.log("MP token mode:", isTestToken ? "sandbox/test" : "production", "len:", MP_TOKEN.length);

    const body = await req.json();
    const { items, customer, shipping } = body as {
      items: Array<{ name: string; quantity: number; unit_amount: number; reference_id?: string }>;
      customer?: { name?: string; email?: string; phone?: string };
      shipping?: Record<string, unknown>;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Items são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const referenceId = `ORDER_${Date.now()}`;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/mercadopago-webhook`;

    const preferencePayload = {
      external_reference: referenceId,
      items: items.map((item, i) => ({
        id: item.reference_id || `item_${i + 1}`,
        title: item.name.substring(0, 250),
        quantity: item.quantity,
        unit_price: Number(item.unit_amount.toFixed(2)),
        currency_id: "BRL",
      })),
      payer: customer?.email
        ? {
            name: customer.name,
            email: customer.email,
          }
        : undefined,
      back_urls: {
        success: "https://www.stillinformatica.com.br/?payment=success",
        failure: "https://www.stillinformatica.com.br/?payment=failure",
        pending: "https://www.stillinformatica.com.br/?payment=pending",
      },
      auto_return: "approved",
      notification_url: webhookUrl,
      statement_descriptor: "STILL INFO",
    };

    console.log("=== MP CREATE PREFERENCE ===");
    console.log("URL:", `${MP_BASE_URL}/checkout/preferences`);
    console.log("Payload:", JSON.stringify(preferencePayload));

    const response = await fetch(`${MP_BASE_URL}/checkout/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_TOKEN}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    const responseText = await response.text();
    console.log("=== MP RESPONSE ===");
    console.log("Status:", response.status);
    console.log("Body:", responseText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Erro ao criar preferência no Mercado Pago",
          details: responseText,
          status_code: response.status,
        }),
        { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = JSON.parse(responseText);
    const paymentUrl = isTestToken ? data.sandbox_init_point : data.init_point;

    const totalAmount = items.reduce((sum, item) => sum + item.unit_amount * item.quantity, 0);

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
      if (dbError) console.error("Erro ao salvar pedido:", dbError);
    }

    return new Response(
      JSON.stringify({
        id: data.id,
        payment_url: paymentUrl,
        reference_id: referenceId,
        status: "CREATED",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("MP checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
