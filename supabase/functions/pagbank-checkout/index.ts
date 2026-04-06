import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PagSeguro v2 API (Checkout Redirect - works with "Pagamento via Formulário HTML")
const PAGSEGURO_WS_URL = "https://ws.pagseguro.uol.com.br/v2/checkout";
const PAGSEGURO_PAYMENT_URL = "https://pagseguro.uol.com.br/v2/checkout/payment.html";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    const PAGBANK_EMAIL = Deno.env.get("PAGBANK_EMAIL");

    console.log("Email:", PAGBANK_EMAIL ? `${PAGBANK_EMAIL.substring(0, 5)}...` : "NOT SET");
    console.log("Token:", PAGBANK_TOKEN ? `${PAGBANK_TOKEN.substring(0, 8)}... (length: ${PAGBANK_TOKEN.length})` : "NOT SET");

    if (!PAGBANK_TOKEN || !PAGBANK_EMAIL) {
      return new Response(
        JSON.stringify({ error: "PAGBANK_TOKEN ou PAGBANK_EMAIL não configurados" }),
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

    // Build XML payload for PagSeguro v2
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<checkout>
  <currency>BRL</currency>
  <reference>${referenceId}</reference>
  <items>`;

    items.forEach((item: { name: string; quantity: number; unit_amount: number; reference_id?: string }, index: number) => {
      xml += `
    <item>
      <id>${String(index + 1).padStart(4, "0")}</id>
      <description>${escapeXml(item.name)}</description>
      <amount>${item.unit_amount.toFixed(2)}</amount>
      <quantity>${item.quantity}</quantity>
    </item>`;
    });

    xml += `
  </items>`;

    // Add customer info if provided
    if (customer) {
      xml += `
  <sender>
    <name>${escapeXml(customer.name || "")}</name>
    <email>${escapeXml(customer.email || "")}</email>`;

      if (customer.phone && customer.phone.length >= 3) {
        const areaCode = customer.phone.substring(0, 2);
        const number = customer.phone.substring(2);
        xml += `
    <phone>
      <areaCode>${areaCode}</areaCode>
      <number>${number}</number>
    </phone>`;
      }

      xml += `
  </sender>`;
    }

    // Add shipping address if provided
    if (shipping) {
      xml += `
  <shipping>
    <addressRequired>true</addressRequired>
    <address>
      <street>${escapeXml(shipping.street || "")}</street>
      <number>${escapeXml(shipping.number || "")}</number>
      <complement>${escapeXml(shipping.complement || "")}</complement>
      <district>${escapeXml(shipping.locality || "")}</district>
      <city>${escapeXml(shipping.city || "")}</city>
      <state>${escapeXml(shipping.region_code || "")}</state>
      <country>BRA</country>
      <postalCode>${(shipping.postal_code || "").replace(/\D/g, "")}</postalCode>
    </address>
  </shipping>`;
    } else {
      xml += `
  <shippingAddressRequired>false</shippingAddressRequired>`;
    }

    xml += `
  <timeout>25</timeout>
  <maxAge>999999999</maxAge>
  <maxUses>999</maxUses>
</checkout>`;

    console.log("Creating PagSeguro v2 checkout with XML payload");

    const url = `${PAGSEGURO_WS_URL}?email=${encodeURIComponent(PAGBANK_EMAIL)}&token=${encodeURIComponent(PAGBANK_TOKEN)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=UTF-8",
      },
      body: xml,
    });

    const responseText = await response.text();
    console.log("PagSeguro response status:", response.status);
    console.log("PagSeguro response:", responseText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar checkout", details: responseText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse XML response to extract checkout code
    const codeMatch = responseText.match(/<code>(.*?)<\/code>/);
    const dateMatch = responseText.match(/<date>(.*?)<\/date>/);

    if (!codeMatch) {
      return new Response(
        JSON.stringify({ error: "Código de checkout não encontrado na resposta", details: responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutCode = codeMatch[1];
    const paymentUrl = `${PAGSEGURO_PAYMENT_URL}?code=${checkoutCode}`;

    return new Response(
      JSON.stringify({
        checkout_code: checkoutCode,
        payment_url: paymentUrl,
        reference_id: referenceId,
        date: dateMatch?.[1] || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
