
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html } = (await req.json()) as EmailPayload;
    
    const smtpUser = "stillinformatica@stillinformatica.com.br";
    const smtpPass = Deno.env.get("ZOHO_SMTP_PASSWORD");

    if (!smtpPass) {
      throw new Error("ZOHO_SMTP_PASSWORD not configured");
    }

    const client = new SmtpClient();

    await client.connectTLS({
      hostname: "smtp.zoho.com",
      port: 465,
      username: smtpUser,
      password: smtpPass,
    });

    await client.send({
      from: smtpUser,
      to: to,
      subject: subject,
      content: html,
      html: html,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true }), {
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

