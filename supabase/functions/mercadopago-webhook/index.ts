import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-signature, x-request-id",
};

const MP_BASE_URL = "https://api.mercadopago.com";

// Map Mercado Pago payment status to internal status
const statusMap: Record<string, string> = {
  pending: "WAITING_PAYMENT",
  approved: "PAID",
  authorized: "IN_ANALYSIS",
  in_process: "IN_ANALYSIS",
  in_mediation: "IN_DISPUTE",
  rejected: "CANCELLED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "IN_DISPUTE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MP_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing env vars");
      return new Response(JSON.stringify({ error: "Config incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const queryType = url.searchParams.get("type") || url.searchParams.get("topic");
    const queryId = url.searchParams.get("data.id") || url.searchParams.get("id");

    let bodyText = "";
    let bodyJson: any = {};
    try {
      bodyText = await req.text();
      if (bodyText) bodyJson = JSON.parse(bodyText);
    } catch {
      console.log("Body not JSON:", bodyText);
    }

    console.log("=== MP WEBHOOK ===");
    console.log("Query:", { queryType, queryId });
    console.log("Body:", bodyText);

    const eventType = bodyJson.type || bodyJson.topic || queryType;
    const resourceId =
      bodyJson?.data?.id || bodyJson?.resource?.split("/").pop() || queryId;

    // We only care about payment events
    if (eventType !== "payment" && eventType !== "payment.created" && eventType !== "payment.updated") {
      console.log("Ignored event type:", eventType);
      return new Response(JSON.stringify({ received: true, ignored: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resourceId) {
      console.error("No payment id found");
      return new Response(JSON.stringify({ error: "Sem payment id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment details from Mercado Pago
    const paymentRes = await fetch(`${MP_BASE_URL}/v1/payments/${resourceId}`, {
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const paymentText = await paymentRes.text();
    console.log("MP payment status:", paymentRes.status);
    console.log("MP payment body:", paymentText);

    if (!paymentRes.ok) {
      return new Response(
        JSON.stringify({ error: "Falha ao buscar pagamento", details: paymentText }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payment = JSON.parse(paymentText);
    const referenceId = payment.external_reference;
    const mappedStatus = statusMap[payment.status] || String(payment.status).toUpperCase();

    if (!referenceId) {
      console.warn("Payment without external_reference:", payment.id);
      return new Response(JSON.stringify({ received: true, no_reference: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: mappedStatus,
        pagbank_id: String(payment.id),
        notification_data: payment,
      })
      .eq("reference_id", referenceId);

    if (error) {
      console.error("Erro ao atualizar pedido:", error);
    } else {
      console.log("Pedido atualizado:", referenceId, "->", mappedStatus);
      
      // Enviar e-mail e registrar coleta se o pagamento foi aprovado
      if (mappedStatus === "PAID") {
        try {
          const { data: orderData } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("reference_id", referenceId)
            .single();

          if (orderData?.customer_email) {
            console.log("Enviando e-mail de confirmação para:", orderData.customer_email);
            
            await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                to: orderData.customer_email,
                subject: "Pagamento Confirmado! - Still Informatica",
                html: `
                  <h1>Olá, ${orderData.customer_name || 'Cliente'}!</h1>
                  <p>Seu pagamento do pedido <strong>${referenceId}</strong> foi confirmado com sucesso.</p>
                  <p>Valor total: R$ ${orderData.total_amount}</p>
                  <p>Em breve você receberá as informações de envio.</p>
                  <br>
                  <p>Atenciosamente,<br>Equipe Still Informatica</p>
                `,
              }),
            });
          }

          // Registrar coleta na Total Express
          console.log("Registrando coleta na Total Express para o pedido:", referenceId);
          await fetch(`${SUPABASE_URL}/functions/v1/calculate-shipping`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ 
              action: "register_collection",
              order: orderData 
            }),
          });

        } catch (procError) {
          console.error("Erro no processamento pós-pagamento:", procError);
        }
      }
    }

    return new Response(JSON.stringify({ received: true, status: mappedStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("MP webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
