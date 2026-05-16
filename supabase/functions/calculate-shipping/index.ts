import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOTAL_EXPRESS_USER = Deno.env.get("TOTAL_EXPRESS_USER");
const TOTAL_EXPRESS_PASSWORD = Deno.env.get("TOTAL_EXPRESS_PASSWORD");
const TOTAL_EXPRESS_REID = Deno.env.get("TOTAL_EXPRESS_REID");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, order, postal_code, items } = body;

    // Ação: Cálculo de Frete via Frenet
    if (!postal_code || typeof postal_code !== "string") {
      return new Response(JSON.stringify({ error: "CEP é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FRENET_TOKEN = Deno.env.get("FRENET_TOKEN");
    const ORIGIN_CEP = "07063000";
    const cep = postal_code.replace(/\D/g, "");
    
    let addressInfo = { street: "", neighborhood: "", city: "", state: "" };
    try {
      const cepResponse = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      if (cepResponse.ok) {
        const j = await cepResponse.json();
        addressInfo = {
          street: j.street || "",
          neighborhood: j.neighborhood || "",
          city: j.city || "",
          state: j.state || "",
        };
      }
    } catch (e) {
      console.warn("CEP fetch failed", e);
    }

    let itemsArray: any[] = [];
    let totalValue = 0;

    if (items && items.length > 0) {
      items.forEach((item: any) => {
        const qty = item.quantity || 1;
        totalValue += (Number(item.price) || 0) * qty;
        itemsArray.push({
          Weight: Number(item.weight) || 0.5,
          Length: Number(item.length) || 15,
          Width: Number(item.width) || 15,
          Height: Number(item.height) || 10,
          Quantity: qty
        });
      });
    }

    let shippingOptions = [];
    if (FRENET_TOKEN) {
      const response = await fetch("https://api.frenet.com.br/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": FRENET_TOKEN },
        body: JSON.stringify({
          SellerCEP: ORIGIN_CEP,
          RecipientCEP: cep,
          ShipmentInvoiceValue: totalValue,
          ShippingItemArray: itemsArray
        }),
      });

      const data = await response.json();
      if (data.ShippingSevicesArray) {
        shippingOptions = data.ShippingSevicesArray
          .filter((s: any) => !s.Error)
          .map((s: any) => ({
            id: `frenet_${s.ServiceCode}`,
            name: s.ServiceDescription,
            price: parseFloat(s.ShippingPrice),
            currency: "BRL",
            estimated_days: parseInt(s.DeliveryTime) + 2,
            description: `Entrega via ${s.Carrier}`,
          }));
      }
    }

    if (shippingOptions.length === 0) {
      shippingOptions.push({
        id: "standard_shipping",
        name: "Envio padrão",
        price: 25.0,
        estimated_days: 7,
        description: "Envio padrão via correios",
      });
    }

    return new Response(JSON.stringify({
      postal_code: cep,
      address: addressInfo,
      shipping_options: shippingOptions,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
