import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

serve(async (req) => {
  console.log("=== SEND EMAIL FUNCTION TRIGGERED ===");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Email Payload:", JSON.stringify({ ...body, html: body.html?.substring(0, 50) + "..." }));
    const { to, subject, html, from } = body as EmailPayload;

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is missing");
      throw new Error("RESEND_API_KEY not configured");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

    console.log("Sending email via Resend Gateway to:", to);
    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: from || "Still Informatica <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const data = await res.json();
    console.log("Resend API Response:", JSON.stringify(data));

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Email error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
