import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGBANK_API_URL = "https://api.pagseguro.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    if (!PAGBANK_TOKEN) {
      return new Response(JSON.stringify({ error: "PAGBANK_TOKEN não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { items, customer, shipping } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Items são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const referenceId = `ORDER_${Date.now()}`;

    // Calculate total amount in cents
    const totalItemsAmount = items.reduce(
      (sum: number, item: { unit_amount: number; quantity: number }) =>
        sum + Math.round(item.unit_amount * 100) * item.quantity,
      0
    );

    // Build PagBank Order payload (universally available API)
    const orderPayload: Record<string, unknown> = {
      reference_id: referenceId,
      customer: customer
        ? {
            name: customer.name,
            email: customer.email,
            tax_id: customer.tax_id || undefined,
            phones: customer.phone
              ? [
                  {
                    country: "55",
                    area: customer.phone.substring(0, 2),
                    number: customer.phone.substring(2),
                    type: "MOBILE",
                  },
                ]
              : undefined,
          }
        : undefined,
      items: items.map(
        (item: {
          name: string;
          quantity: number;
          unit_amount: number;
          reference_id?: string;
        }) => ({
          reference_id: item.reference_id || referenceId,
          name: item.name,
          quantity: item.quantity,
          unit_amount: Math.round(item.unit_amount * 100),
        })
      ),
      shipping: shipping
        ? {
            address: {
              street: shipping.street,
              number: shipping.number,
              complement: shipping.complement || "",
              locality: shipping.locality,
              city: shipping.city,
              region_code: shipping.region_code,
              country: "BRA",
              postal_code: shipping.postal_code,
            },
          }
        : undefined,
      qr_codes: [
        {
          amount: { value: totalItemsAmount },
        },
      ],
      notification_urls: [],
    };

    console.log("Creating PagBank order:", JSON.stringify(orderPayload));

    const response = await fetch(`${PAGBANK_API_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PAGBANK_TOKEN}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("PagBank error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Erro ao criar pedido", details: data }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("PagBank order created:", JSON.stringify(data));

    // Extract PIX QR code link if available
    const qrCode = data.qr_codes?.[0];
    const pixLink = qrCode?.links?.find(
      (l: { rel: string; href: string }) => l.rel === "QRCODE.PNG"
    )?.href;
    const pixText = qrCode?.text;

    // Extract payment link from response
    const paymentLink = data.links?.find(
      (l: { rel: string; href: string }) => l.rel === "PAY"
    )?.href;

    return new Response(
      JSON.stringify({
        order_id: data.id,
        payment_url: paymentLink || null,
        pix_qr_code_url: pixLink || null,
        pix_text: pixText || null,
        reference_id: referenceId,
        status: data.charges?.[0]?.status || data.status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Order error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
