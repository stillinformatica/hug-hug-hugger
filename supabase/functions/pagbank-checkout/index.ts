import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_BASE_URL = "https://ws.sandbox.pagbank.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    const PAGBANK_EMAIL = Deno.env.get("PAGBANK_EMAIL");

    if (!PAGBANK_TOKEN || !PAGBANK_EMAIL) {
      return new Response(
        JSON.stringify({ error: "PAGBANK_TOKEN ou PAGBANK_EMAIL não configurado" }),
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

    const referenceId = `ORDER_${Date.now()}`;

    // Construir XML para API v2 do PagSeguro
    const totalAmount = items.reduce(
      (sum: number, item: { unit_amount: number; quantity: number }) =>
        sum + item.unit_amount * item.quantity,
      0
    ).toFixed(2);

    // Construir itens no formato de query string (API v2 usa application/x-www-form-urlencoded)
    const params = new URLSearchParams();
    params.append("email", PAGBANK_EMAIL);
    params.append("token", PAGBANK_TOKEN);
    params.append("currency", "BRL");
    params.append("reference", referenceId);
    params.append("redirectURL", "https://hug-hug-hugger.lovable.app/?payment=success");
    params.append("notificationURL", "https://hug-hug-hugger.lovable.app/api/pagbank-webhook");

    // Adicionar itens
    items.forEach((item: { name: string; quantity: number; unit_amount: number }, index: number) => {
      const i = index + 1;
      params.append(`itemId${i}`, String(i));
      params.append(`itemDescription${i}`, item.name.substring(0, 100));
      params.append(`itemAmount${i}`, item.unit_amount.toFixed(2));
      params.append(`itemQuantity${i}`, String(item.quantity));
    });

    // Dados do comprador (opcional)
    if (customer) {
      if (customer.name) params.append("senderName", customer.name.substring(0, 50));
      if (customer.email) {
        // No sandbox, o email precisa ter @sandbox.pagseguro.com.br
        const senderEmail = customer.email.includes("@sandbox.pagseguro.com.br")
          ? customer.email
          : `${customer.email.split("@")[0]}@sandbox.pagseguro.com.br`;
        params.append("senderEmail", senderEmail);
      }
      if (customer.phone) {
        params.append("senderAreaCode", customer.phone.substring(0, 2));
        params.append("senderPhone", customer.phone.substring(2, 11));
      }
      if (customer.tax_id) {
        params.append("senderCPF", customer.tax_id.replace(/\D/g, ""));
      }
    }

    // Endereço de entrega (opcional)
    if (shipping) {
      params.append("shippingType", "3"); // Não especificado
      if (shipping.street) params.append("shippingAddressStreet", shipping.street);
      if (shipping.number) params.append("shippingAddressNumber", shipping.number);
      if (shipping.complement) params.append("shippingAddressComplement", shipping.complement);
      if (shipping.locality) params.append("shippingAddressDistrict", shipping.locality);
      if (shipping.city) params.append("shippingAddressCity", shipping.city);
      if (shipping.region_code) params.append("shippingAddressState", shipping.region_code);
      if (shipping.postal_code) params.append("shippingAddressPostalCode", shipping.postal_code.replace(/\D/g, ""));
      params.append("shippingAddressCountry", "BRA");
    }

    console.log("Calling PagBank v2 checkout...");
    console.log("URL:", `${PAGBANK_BASE_URL}/v2/checkout`);
    console.log("Email:", PAGBANK_EMAIL);
    console.log("Token length:", PAGBANK_TOKEN?.length, "Token prefix:", PAGBANK_TOKEN?.substring(0, 6));
    console.log("Body params:", params.toString().substring(0, 300));

    const response = await fetch(`${PAGBANK_BASE_URL}/v2/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: params.toString(),
    });

    const responseText = await response.text();
    console.log("PagBank v2 response status:", response.status);
    console.log("PagBank v2 response:", responseText.substring(0, 1000));

    if (response.ok) {
      // Resposta é XML, extrair código do checkout
      const codeMatch = responseText.match(/<code>([^<]+)<\/code>/);
      const dateMatch = responseText.match(/<date>([^<]+)<\/date>/);

      if (codeMatch) {
        const checkoutCode = codeMatch[1];
        // URL de pagamento do sandbox
        const paymentUrl = `https://sandbox.pagbank.com.br/v2/checkout/payment.html?code=${checkoutCode}`;

        console.log("Checkout code:", checkoutCode);
        console.log("Payment URL:", paymentUrl);

        return new Response(
          JSON.stringify({
            id: checkoutCode,
            payment_url: paymentUrl,
            reference_id: referenceId,
            status: "CREATED",
            endpoint_used: "v2/checkout",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Extrair erro do XML
    const errorMatch = responseText.match(/<message>([^<]+)<\/message>/);
    const errorCode = responseText.match(/<code>([^<]+)<\/code>/);

    return new Response(
      JSON.stringify({
        error: "Erro no checkout PagBank",
        details: errorMatch ? errorMatch[1] : responseText.substring(0, 500),
        error_code: errorCode ? errorCode[1] : null,
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
