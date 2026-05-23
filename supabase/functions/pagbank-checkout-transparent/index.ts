import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_BASE_URL = "https://api.pagseguro.com";
const MARKETPLACE_ID = "ACCO_FB6B17D3-56D1-45AE-9C96-7A78E2DEE219";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAGBANK_TOKEN) {
      return new Response(
        JSON.stringify({ error: "PAGBANK_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { items, customer, shipping, card_token, security_code, installments, payment_method = "CREDIT_CARD" } = body;

    const referenceId = `ORDER_${Date.now()}`;

    const orderItems = items.map((item: any, index: number) => ({
      reference_id: `item_${index + 1}`,
      name: item.name.substring(0, 64),
      quantity: item.quantity,
      unit_amount: Math.round(item.unit_amount * 100),
    }));

    const totalAmount = orderItems.reduce(
      (sum: number, item: any) => sum + item.unit_amount * item.quantity,
      0
    );

    const payload: any = {
      reference_id: referenceId,
      customer: {
        name: customer.name,
        email: customer.email,
        tax_id: customer.cpf.replace(/\D/g, ""),
        phones: [{
          country: "55",
          area: customer.phone.replace(/\D/g, "").substring(0, 2),
          number: customer.phone.replace(/\D/g, "").substring(2),
          type: "MOBILE"
        }]
      },
      items: orderItems,
      shipping: {
        address: {
          street: shipping.street,
          number: shipping.number || "1",
          complement: shipping.complement || "N/A",
          locality: shipping.locality,
          city: shipping.city,
          region_code: shipping.region_code,
          country: "BRA",
          postal_code: shipping.postal_code.replace(/\D/g, ""),
        }
      },
      notification_urls: [`${SUPABASE_URL}/functions/v1/pagbank-webhook`]
    };

    if (payment_method === "PIX") {
      payload.qr_codes = [{
        amount: {
          value: totalAmount
        },
        expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      }];
    } else {
      payload.payment_method = {
        type: "CREDIT_CARD",
        installments: installments || 1,
        capture: true,
        card: {
          encrypted: card_token,
          security_code: security_code || "000",
          store: false,
          holder: {
            name: customer.name,
            tax_id: customer.cpf.replace(/\D/g, "")
          }
        }
      };
      
      // Validação de segurança extra para holder tax_id se necessário
      if (payload.payment_method.card.holder.tax_id.length !== 11 && payload.payment_method.card.holder.tax_id.length !== 14) {
        console.error("CPF/CNPJ inválido para o portador do cartão:", payload.payment_method.card.holder.tax_id);
      }
    }

    const response = await fetch(`${PAGBANK_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      // Save order to DB
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("orders").insert({
          reference_id: referenceId,
          pagbank_id: data.id,
          status: data.charges?.[0]?.status || "PENDING",
          customer_name: customer.name,
          customer_email: customer.email,
          total_amount: totalAmount / 100,
          items: items,
          shipping_address: shipping,
        });
      }

      const qrCode = data.qr_codes?.[0];
      
      return new Response(
        JSON.stringify({ 
          status: data.charges?.[0]?.status || (qrCode ? "PENDING" : "UNKNOWN"), 
          reference_id: referenceId,
          id: data.id,
          qr_code: qrCode ? {
            text: qrCode.text,
            links: qrCode.links
          } : null
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Erro no processamento PagBank", details: data }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});