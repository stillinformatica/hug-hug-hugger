import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_SANDBOX_WS = "https://ws.sandbox.pagbank.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAGBANK_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing environment variables");
      return new Response(
        JSON.stringify({ error: "Configuração incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.text();
    console.log("PagBank notification received:", body);

    // PagBank sends notifications as form-encoded or JSON
    let notificationCode: string | null = null;
    let notificationType: string | null = null;

    // Try form-encoded first (PagBank v2 style)
    if (body.includes("notificationCode")) {
      const params = new URLSearchParams(body);
      notificationCode = params.get("notificationCode");
      notificationType = params.get("notificationType");
    } else {
      // Try JSON (PagBank v4 style)
      try {
        const jsonBody = JSON.parse(body);
        notificationCode = jsonBody.id || jsonBody.notificationCode;
        notificationType = jsonBody.notificationType || "transaction";
        
        // v4 webhooks may include charge data directly
        if (jsonBody.charges) {
          const charge = jsonBody.charges[0];
          const referenceId = jsonBody.reference_id;
          
          const { error } = await supabase
            .from("orders")
            .update({
              status: charge?.status || "UNKNOWN",
              pagbank_id: jsonBody.id,
              notification_data: jsonBody,
            })
            .eq("reference_id", referenceId);

          if (error) console.error("Error updating order (v4):", error);
          else console.log("Order updated via v4 webhook:", referenceId, charge?.status);

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch {
        console.log("Body is not JSON, trying other formats");
      }
    }

    if (!notificationCode) {
      console.error("No notification code found in body:", body);
      return new Response(
        JSON.stringify({ error: "notificationCode não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Notification code:", notificationCode, "Type:", notificationType);

    // Query PagBank sandbox for transaction details
    if (notificationType === "transaction") {
      const response = await fetch(
        `${PAGBANK_SANDBOX_WS}/v3/transactions/notifications/${notificationCode}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PAGBANK_TOKEN}`,
          },
        }
      );

      const responseText = await response.text();
      console.log("PagBank transaction details:", responseText);

      if (response.ok) {
        try {
          const txData = JSON.parse(responseText);
          const referenceId = txData.reference_id || txData.reference;

          // Map PagBank status codes to readable status
          const statusMap: Record<string, string> = {
            "1": "WAITING_PAYMENT",
            "2": "IN_ANALYSIS",
            "3": "PAID",
            "4": "AVAILABLE",
            "5": "IN_DISPUTE",
            "6": "REFUNDED",
            "7": "CANCELLED",
            "8": "DEBITED",
            "9": "TEMPORARY_RETENTION",
          };

          const status = statusMap[String(txData.status)] || txData.status || "UNKNOWN";

          if (referenceId) {
            const { error } = await supabase
              .from("orders")
              .update({
                status,
                pagbank_id: txData.code || txData.id,
                notification_data: txData,
              })
              .eq("reference_id", referenceId);

            if (error) console.error("Error updating order:", error);
            else console.log("Order updated:", referenceId, "->", status);
          }
        } catch (parseErr) {
          console.error("Error parsing transaction data:", parseErr);
        }
      } else {
        console.error("Error fetching transaction:", response.status, responseText);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
