import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_PROD_WS = "https://ws.pagseguro.uol.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing environment variables");
      return new Response(
        JSON.stringify({ error: "Configuração incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const bodyText = await req.text();
    console.log("PagBank notification received. Headers:", Object.fromEntries(req.headers.entries()));
    console.log("Body:", bodyText);

    let notificationData: any = null;
    let referenceId: string | null = null;
    let status: string | null = null;
    let pagbankId: string | null = null;

    // Try to parse as JSON first (v4 Orders API)
    try {
      notificationData = JSON.parse(bodyText);
      console.log("Parsed as JSON (v4)");

      // PagBank v4 Orders API webhook structure
      if (notificationData.reference_id) {
        referenceId = notificationData.reference_id;
        pagbankId = notificationData.id;
        
        // Find status from charges
        if (notificationData.charges && notificationData.charges.length > 0) {
          status = notificationData.charges[0].status;
        } else if (notificationData.status) {
          status = notificationData.status;
        }
      }
    } catch (e) {
      // Not JSON, check if it's form-encoded (v2/v3)
      console.log("Not JSON, checking form-encoded...");
      const params = new URLSearchParams(bodyText);
      const notificationCode = params.get("notificationCode");
      const notificationType = params.get("notificationType");

      if (notificationCode && notificationType === "transaction") {
        console.log("v3 Transaction notification detected. Fetching details...");
        
        const response = await fetch(
          `${PAGBANK_PROD_WS}/v3/transactions/notifications/${notificationCode}?email=${Deno.env.get("PAGBANK_EMAIL")}&token=${PAGBANK_TOKEN}`,
          { method: "GET" }
        );

        if (response.ok) {
          const xmlText = await response.text();
          console.log("v3 details received (XML):", xmlText);
          
          // Basic XML extraction (could use a library, but regex is faster for simple cases)
          const refMatch = xmlText.match(/<reference>(.*?)<\/reference>/);
          const statusMatch = xmlText.match(/<status>(.*?)<\/status>/);
          const codeMatch = xmlText.match(/<code>(.*?)<\/code>/);

          referenceId = refMatch ? refMatch[1] : null;
          pagbankId = codeMatch ? codeMatch[1] : null;
          
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
          
          status = statusMatch ? (statusMap[statusMatch[1]] || statusMatch[1]) : null;
        } else {
          console.error("Failed to fetch v3 details:", await response.text());
        }
      }
    }

    if (referenceId && status) {
      console.log(`Updating order ${referenceId} to status ${status}`);
      
      const { error } = await supabase
        .from("orders")
        .update({
          status: status,
          pagbank_id: pagbankId,
          notification_data: notificationData || bodyText,
          updated_at: new Date().toISOString(),
        })
        .eq("reference_id", referenceId);

      if (error) {
        console.error("Error updating order in database:", error);
      } else {
        console.log("Order updated successfully");
      }
    } else {
      console.warn("Could not determine reference_id and status from notification");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in webhook handler:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
