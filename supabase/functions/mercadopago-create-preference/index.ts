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

    const body = await req.json();
    const { items, customer, shipping, shippingCost } = body as {
      items: Array<{ name: string; quantity: number; unit_amount: number; reference_id?: string; image?: string }>;
      customer?: { name?: string; email?: string; phone?: string };
      shipping?: Record<string, unknown>;
      shippingCost?: number;
    };

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Itens do pedido são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const referenceId = `ORDER_${Date.now()}`;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/mercadopago-webhook`;

    const origin = req.headers.get("origin") || "https://www.stillinformatica.com.br";

    const mpItems = items.map((item, idx) => ({
      id: item.reference_id || `item_${idx + 1}`,
      title: item.name.substring(0, 256),
      quantity: item.quantity,
      unit_price: Number(item.unit_amount.toFixed(2)),
      currency_id: "BRL",
      picture_url: item.image,
    }));

    if (shippingCost && shippingCost > 0) {
      mpItems.push({
        id: "shipping",
        title: "Frete",
        quantity: 1,
        unit_price: Number(shippingCost.toFixed(2)),
        currency_id: "BRL",
      });
    }

    const [firstName, ...rest] = (customer?.name || "").split(" ");
    const preferencePayload: Record<string, unknown> = {
      items: mpItems,
      payer: customer?.email
        ? {
          name: firstName || undefined,
          surname: rest.join(" ") || undefined,
          email: customer.email,
          phone: customer?.phone ? { number: customer.phone } : undefined,
        }
        : undefined,
      back_urls: {
        success: `${origin}/checkout?payment=success&ref=${referenceId}`,
        pending: `${origin}/checkout?payment=pending&ref=${referenceId}`,
        failure: `${origin}/checkout?payment=failure&ref=${referenceId}`,
      },
      auto_return: "approved",
      external_reference: referenceId,
      notification_url: webhookUrl,
      statement_descriptor: "STILL INFO",
    };

    console.log("=== MP CREATE PREFERENCE ===");
    console.log("Reference:", referenceId);
    console.log("Origin:", origin);

    const response = await fetch(`${MP_BASE_URL}/checkout/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_TOKEN}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    const responseText = await response.text();
    console.log("MP Status:", response.status);
    console.log("MP Body:", responseText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Erro ao criar preferência de pagamento",
          details: responseText,
          status_code: response.status,
        }),
        { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = JSON.parse(responseText);

    const totalAmount = mpItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: dbError } = await supabase.from("orders").insert({
        reference_id: referenceId,
        pagbank_id: String(data.id),
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
        reference_id: referenceId,
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("MP create preference error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
