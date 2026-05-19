import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ORIGIN_CEP = "07063000";

const MELHORENVIO_URL = Deno.env.get("MELHORENVIO_ENV") === "sandbox"
  ? "https://sandbox.melhorenvio.com.br"
  : "https://melhorenvio.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, order, postal_code, items } = body;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const MELHORENVIO_TOKEN = Deno.env.get("MELHORENVIO_TOKEN");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ────────────────────────────────────────────────────────────────
    // AÇÃO: Gerar etiqueta/compra no Melhor Envio
    // ────────────────────────────────────────────────────────────────
    if (action === "register_collection" && order) {
      console.log("Iniciando Integração Melhor Envio para o pedido:", order.id);

      if (!MELHORENVIO_TOKEN) {
        console.error("MELHORENVIO_TOKEN não configurado");
        return new Response(JSON.stringify({ error: "Configuração incompleta" }), { status: 500, headers: corsHeaders });
      }

      const itemsList = order.items || order.order_items || [];
      
      // Montar payload para o carrinho do Melhor Envio
      const cartBody = {
        service: order.shipping_address?.shipping_service_id || order.shipping_service_id || 1, // Default para algum serviço se não vier no pedido
        agency: order.shipping_agency_id || null,
        from: {
          name: "Still Informatica",
          email: "contato@stillinformatica.com.br",
          phone: "1199999999",
          postal_code: ORIGIN_CEP,
          address: "Rua Exemplo",
          number: "123",
          district: "Bairro",
          city: "Guarulhos",
          state_abbr: "SP",
          country_id: "BR"
        },
        to: {
          name: String(order.customer_name || 'Cliente'),
          email: String(order.customer_email || ''),
          phone: String(order.customer_phone || '').replace(/\D/g, ''),
          document: String(order.customer_cpf || '').replace(/\D/g, ''),
          postal_code: String(order.shipping_address?.postal_code || order.postal_code || '').replace(/\D/g, ''),
          address: String(order.shipping_address?.street || ''),
          number: String(order.shipping_address?.number || 'S/N'),
          district: String(order.shipping_address?.locality || order.shipping_address?.neighborhood || ''),
          city: String(order.shipping_address?.city || ''),
          state_abbr: String(order.shipping_address?.region_code || order.shipping_address?.state || ''),
          country_id: "BR"
        },
        products: itemsList.map((item: any) => ({
          name: item.name || "Produto",
          quantity: item.quantity || 1,
          unitary_value: Number(item.price || 0)
        })),
        volumes: [{
          weight: itemsList.reduce((acc: number, item: any) => acc + (Number(item.weight || 0.5) * (item.quantity || 1)), 0),
          width: 15,
          height: 10,
          length: 15
        }],
        options: {
          insurance_value: Number(order.total_amount || 0),
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true // Usando declaração de conteúdo por padrão para simplificar
        }
      };

      try {
        // 1. Adicionar ao carrinho
        const cartRes = await fetch(`${MELHORENVIO_URL}/api/v2/me/cart`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MELHORENVIO_TOKEN}`,
            "User-Agent": "StillInformatica (contato@stillinformatica.com.br)"
          },
          body: JSON.stringify(cartBody)
        });

        const cartData = await cartRes.json();
        console.log("Melhor Envio Cart Response:", cartData);

        if (cartRes.ok && cartData.id) {
          // 2. Checkout (Compra da etiqueta)
          const checkoutRes = await fetch(`${MELHORENVIO_URL}/api/v2/me/shipment/checkout`, {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "Authorization": `Bearer ${MELHORENVIO_TOKEN}`,
              "User-Agent": "StillInformatica (contato@stillinformatica.com.br)"
            },
            body: JSON.stringify({ orders: [cartData.id] })
          });

          const checkoutData = await checkoutRes.json();
          console.log("Melhor Envio Checkout Response:", checkoutData);

          // Atualizar pedido com ID da etiqueta
          await supabase
            .from("orders")
            .update({ 
              shipping_label_id: cartData.id,
              tracking_number: cartData.protocol || null
            })
            .eq("id", order.id);

          return new Response(JSON.stringify({ success: true, data: checkoutData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ success: false, error: cartData }), {
          status: cartRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Erro Melhor Envio:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ────────────────────────────────────────────────────────────────
    // AÇÃO: Cálculo de Frete via Melhor Envio
    // ────────────────────────────────────────────────────────────────
    if (!postal_code || typeof postal_code !== "string") {
      return new Response(JSON.stringify({ error: "CEP é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cep = postal_code.replace(/\D/g, "");
    if (cep.length !== 8) {
      return new Response(JSON.stringify({ error: "CEP inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let shippingOptions: any[] = [];
    let address = null;

    // Busca endereço via ViaCEP
    try {
      const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const viaCepData = await viaCepResponse.json();
      if (!viaCepData.erro) {
        address = {
          street: viaCepData.logradouro,
          neighborhood: viaCepData.bairro,
          city: viaCepData.localidade,
          state: viaCepData.uf,
        };
      }
    } catch (e) { console.error(e); }

    if (MELHORENVIO_TOKEN) {
      try {
        console.log(`Calculando frete Melhor Envio para CEP ${cep}`);
        
        const quoteRes = await fetch(`${MELHORENVIO_URL}/api/v2/me/shipment/calculate`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MELHORENVIO_TOKEN}`,
            "User-Agent": "StillInformatica (contato@stillinformatica.com.br)"
          },
          body: JSON.stringify({
            from: { postal_code: ORIGIN_CEP },
            to: { postal_code: cep },
            products: items?.map((i: any) => ({
              id: i.id || "p1",
              width: 15,
              height: 10,
              length: 15,
              weight: Number(i.weight || 0.5),
              insurance_value: Number(i.price || 0),
              quantity: i.quantity || 1
            })) || [{ id: "p1", width: 15, height: 10, length: 15, weight: 0.5, insurance_value: 100, quantity: 1 }]
          })
        });

        const data = await quoteRes.json();
        if (Array.isArray(data)) {
          shippingOptions = data
            .filter((s: any) => !s.error)
            .map((s: any) => ({
              id: String(s.id),
              name: s.name,
              carrier: s.company.name,
              price: Number(s.custom_price || s.price),
              currency: "BRL",
              estimated_days: Number(s.custom_delivery_time || s.delivery_time) + 2,
              description: `Entrega via ${s.company.name} (${s.name})`,
            }));
        }
      } catch (e) {
        console.error("Erro Melhor Envio Quote:", e);
      }
    }

    // Fallback final se nada funcionar
    if (shippingOptions.length === 0) {
      shippingOptions.push({
        id: "standard_shipping",
        name: "Envio padrão",
        carrier: "Padrão",
        price: 25.0,
        currency: "BRL",
        estimated_days: 7,
        description: "Envio padrão: 7 dias úteis",
      });
    }

    return new Response(JSON.stringify({
      postal_code: cep,
      shipping_options: shippingOptions,
      address: address,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erro no cálculo de frete:", error);
    return new Response(JSON.stringify({ error: "Erro ao calcular frete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
