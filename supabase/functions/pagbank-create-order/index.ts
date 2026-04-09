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
    const { items, customer, shipping, charges } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Items são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const referenceId = `ORDER_${Date.now()}`;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/pagbank-webhook`;

    const orderPayload: Record<string, unknown> = {
      reference_id: referenceId,
      customer: {
        name: customer?.name || "Cliente",
        email: customer?.email || "cliente@email.com",
        tax_id: customer?.tax_id || "12345678909",
        phones: customer?.phones || [
          {
            country: "55",
            area: "11",
            number: "999999999",
            type: "MOBILE",
          },
        ],
      },
      items: items.map((item: { reference_id?: string; name: string; quantity: number; unit_amount: number }, index: number) => ({
        reference_id: item.reference_id || `item_${index + 1}`,
        name: item.name.substring(0, 64),
        quantity: item.quantity,
        unit_amount: Math.round(item.unit_amount),
      })),
      notification_urls: [webhookUrl],
    };

    if (shipping) {
      orderPayload.shipping = {
        address: {
          street: shipping.street,
          number: shipping.number || "S/N",
          complement: shipping.complement || "",
          locality: shipping.locality,
          city: shipping.city,
          region_code: shipping.region_code,
          country: "BRA",
          postal_code: shipping.postal_code?.replace(/\D/g, ""),
        },
      };
    }

    if (charges && Array.isArray(charges) && charges.length > 0) {
      orderPayload.charges = charges;
    }

    const payloadJson = JSON.stringify(orderPayload);
    console.log("=== PAGBANK CREATE ORDER REQUEST ===");
    console.log("URL:", `${PAGBANK_BASE_URL}/orders`);
    console.log("Payload:", payloadJson);

    const response = await fetch(`${PAGBANK_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
        "x-api-version": "4.0",
      },
      body: payloadJson,
    });

    const responseText = await response.text();
    console.log("=== PAGBANK CREATE ORDER RESPONSE ===");
    console.log("Status:", response.status);
    console.log("Body:", responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const totalAmount = items.reduce(
          (sum: number, item: { unit_amount: number; quantity: number }) => sum + item.unit_amount * item.quantity,
          0
        );
        await supabase.from("orders").insert({
          reference_id: referenceId,
          pagbank_id: data.id,
          status: data.charges?.[0]?.status || "CREATED",
          customer_name: customer?.name || null,
          customer_email: customer?.email || null,
          total_amount: totalAmount,
          items: items,
          shipping_address: shipping || null,
        });
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Erro no pedido PagBank",
        details: responseText.substring(0, 500),
        status_code: response.status,
      }),
      { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Order error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
