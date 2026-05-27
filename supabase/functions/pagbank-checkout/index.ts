import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_BASE_URL = "https://api.pagseguro.com"; // Keep production URL unless debugging specifically with sandbox

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    const PAGBANK_PUBLIC_KEY = Deno.env.get("PAGBANK_PUBLIC_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAGBANK_TOKEN) {
      return new Response(
        JSON.stringify({ error: "PAGBANK_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { items, customer, shipping } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Items são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const referenceId = `STILL${Date.now()}`; // Shorter and no underscores just in case

    const orderItems = items.map((item: { name: string; quantity: number; unit_amount: number }, index: number) => ({
      reference_id: `item_${index + 1}`,
      name: item.name.substring(0, 64),
      quantity: item.quantity,
      unit_amount: Math.max(1, Math.round(item.unit_amount * 100)), // Ensure at least 0.01
    }));

    const totalAmount = orderItems.reduce(
      (sum: number, item: { unit_amount: number; quantity: number }) => sum + item.unit_amount * item.quantity,
      0
    );

    // Webhook URL via edge function
    const webhookUrl = `${SUPABASE_URL}/functions/v1/pagbank-webhook`;

    const checkoutPayload: any = {
      reference_id: referenceId,
      items: orderItems,
      additional_amount: 0,
      discount_amount: 0,
      soft_descriptor: "STILL INF",
      payment_methods: [
        { type: "CREDIT_CARD" },
        { type: "DEBIT_CARD" },
        { type: "BOLETO" },
        { type: "PIX" },
      ],
      // Simplified configs to avoid redirect loops on some account types
      payment_methods_configs: [],
      redirect_urls: {
        return_url: "https://www.stillinformatica.com.br/checkout?payment=success",
        back_url: "https://www.stillinformatica.com.br/checkout?payment=cancelled",
      },
      notification_urls: [webhookUrl],
    };

    if (customer) {
      checkoutPayload.customer = {
        name: customer.name,
        email: customer.email,
        tax_id: customer.cpf?.replace(/\D/g, ""),
        phones: customer.phone ? [{
          country: "55",
          area: customer.phone.substring(0, 2),
          number: customer.phone.substring(2),
          type: "MOBILE"
        }] : []
      };
    }

    if (shipping) {
      checkoutPayload.shipping = {
        type: "FIXED",
        amount: Math.round((shipping.amount || 0) * 100),
        address: {
          street: shipping.street,
          number: shipping.number && shipping.number !== "S/N" ? shipping.number : "1",
          complement: shipping.complement || "N/A",
          locality: shipping.locality,
          city: shipping.city,
          region_code: shipping.region_code,
          country: "BRA",
          postal_code: shipping.postal_code?.replace(/\D/g, ""),
        }
      };
    }

    const payloadJson = JSON.stringify(checkoutPayload);
    console.log("=== PAGBANK CHECKOUT REQUEST ===");
    console.log("URL:", `${PAGBANK_BASE_URL}/checkouts`);
    console.log("Webhook URL:", webhookUrl);
    console.log("Payload:", payloadJson);

    const response = await fetch(`${PAGBANK_BASE_URL}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
        "x-api-version": "4.0",
      },
      body: payloadJson,
    });

    const responseText = await response.text();
    console.log("=== PAGBANK CHECKOUT RESPONSE ===");
    console.log("Status:", response.status);
    console.log("Body:", responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log("PagBank API Data:", JSON.stringify(data));
      
      const paymentLink = data.links?.find((l: { rel: string }) => l.rel === "PAY");
      let paymentUrl = paymentLink?.href;
      
      // Fix for potential PagBank redirect loop or sandbox issues
      if (paymentUrl && paymentUrl.includes("sandbox")) {
        console.log("Detectado URL de sandbox, mantendo como está:", paymentUrl);
      }
      
      if (!paymentUrl) {
        console.error("PagBank API returned no payment link. Available links:", data.links);
        
        // Se não houver link de pagamento, pode ser que a conta não esteja autorizada para checkout redirecionado
        return new Response(
          JSON.stringify({ 
            error: "Sua conta PagSeguro não retornou um link de pagamento. Verifique se o Checkout Redirecionado está ativo em sua conta ou se há pendências no cadastro.",
            details: data 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Save order to database
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        try {
          const { error: dbError } = await supabase.from("orders").insert({
            reference_id: referenceId,
            pagbank_id: data.id,
            status: "CREATED",
            customer_name: customer?.name || null,
            customer_email: customer?.email || null,
            total_amount: totalAmount / 100,
            items: items,
            shipping_address: shipping || null,
          });
          if (dbError) console.error("Error saving order to DB:", dbError);
          else console.log("Order successfully saved to DB:", referenceId);
        } catch (dbEx) {
          console.error("Exception saving order to DB:", dbEx);
        }
      }

      return new Response(
        JSON.stringify({
          id: data.id,
          payment_url: paymentUrl,
          public_key: PAGBANK_PUBLIC_KEY,
          reference_id: referenceId,
          status: "CREATED",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Erro no checkout PagBank",
        details: responseText,
        status_code: response.status,
      }),
      { status: response.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
