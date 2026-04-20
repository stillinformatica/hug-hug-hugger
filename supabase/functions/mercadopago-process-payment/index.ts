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
    const {
      formData,
      items,
      customer,
      shipping,
      totalAmount,
    } = body as {
      formData: Record<string, unknown>;
      items: Array<{ name: string; quantity: number; unit_amount: number; reference_id?: string }>;
      customer?: { name?: string; email?: string; phone?: string };
      shipping?: Record<string, unknown>;
      totalAmount: number;
    };

    if (!formData || !items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Dados de pagamento inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const referenceId = `ORDER_${Date.now()}`;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/mercadopago-webhook`;

    // formData vem do Payment Brick e já contém token, payment_method_id, etc.
    const paymentPayload: Record<string, unknown> = {
      ...formData,
      transaction_amount: Number(totalAmount.toFixed(2)),
      description: `Pedido ${referenceId}`,
      external_reference: referenceId,
      notification_url: webhookUrl,
      statement_descriptor: "STILL INFO",
    };

    console.log("=== MP PROCESS PAYMENT ===");
    console.log("Reference:", referenceId);
    console.log("Amount:", totalAmount);
    console.log("Method:", (formData as any).payment_method_id);

    const response = await fetch(`${MP_BASE_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": referenceId,
        Authorization: `Bearer ${MP_TOKEN}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    const responseText = await response.text();
    console.log("MP Status:", response.status);
    console.log("MP Body:", responseText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Erro ao processar pagamento",
          details: responseText,
          status_code: response.status,
        }),
        { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = JSON.parse(responseText);

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: dbError } = await supabase.from("orders").insert({
        reference_id: referenceId,
        pagbank_id: String(data.id),
        status: data.status?.toUpperCase() || "CREATED",
        customer_name: customer?.name || null,
        customer_email: customer?.email || null,
        total_amount: totalAmount,
        items: items,
        shipping_address: shipping || null,
        notification_data: data,
      });
      if (dbError) console.error("Erro ao salvar pedido:", dbError);
    }

    return new Response(
      JSON.stringify({
        id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        reference_id: referenceId,
        // Dados para PIX
        qr_code: data.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
        // Dados para Boleto
        boleto_url: data.transaction_details?.external_resource_url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("MP process payment error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
