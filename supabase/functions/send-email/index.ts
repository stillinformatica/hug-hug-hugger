
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    // Usaremos a API de envio de e-mail do Zoho (HTTPS)
    // Para isso, precisaríamos de um access token. 
    // Como o usuário deu App Password, ele quer SMTP. 
    // Vamos usar a lib 'deno-smtp' que é mais moderna e compatível com Deno Deploy
    
    // Devido às limitações do ambiente Edge com sockets TCP brutos, 
    // a melhor forma de enviar e-mail SEMPRE é via API HTTP.
    
    // Vou tentar uma última abordagem com uma lib SMTP que usa std/streams
    // Se falhar, usarei um provedor HTTP.

    console.log(`Sending email to ${to}`);

    // Como o SMTP direto está falhando por compatibilidade da lib,
    // vamos integrar com o serviço que o Lovable recomenda para evitar esses problemas.
    // Mas o usuário especificou Zoho.
    
    // Vou configurar a chamada via API do Zoho Mail. 
    // Para isso, precisamos de um Client ID/Secret do Zoho para OAuth2, 
    // ou usar o SMTP Relay se o Deno permitir.
    
    // Tentaremos o Zoho SMTP via porta 587 (STARTTLS) que costuma ser mais compatível.
    
    return new Response(JSON.stringify({ 
      error: "O ambiente de execução (Edge Functions) possui restrições para conexões SMTP diretas. Recomendo usar um serviço como Resend (grátis até 3k emails) que funciona perfeitamente aqui, ou precisaremos de mais configurações no Zoho (Client ID/Secret) para usar a API HTTP." 
    }), {
      status: 400,
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


