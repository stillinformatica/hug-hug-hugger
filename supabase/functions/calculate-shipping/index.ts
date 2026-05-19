import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ORIGIN_CEP = "07063000";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, order, postal_code, items } = body;

    // ────────────────────────────────────────────────────────────────
    // AÇÃO: Registrar coleta na Total Express (Smart Label REST API)
    // ────────────────────────────────────────────────────────────────
    if (action === "register_collection" && order) {
      console.log("Iniciando Registro de Coleta na Total Express para o pedido:", order.id);

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const TOTAL_EXPRESS_USER = Deno.env.get("TOTAL_EXPRESS_USER");
      const TOTAL_EXPRESS_PASSWORD = Deno.env.get("TOTAL_EXPRESS_PASSWORD");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const itemsList = order.items || order.order_items || [];
      const totalVolumes = itemsList.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
      const totalWeight = itemsList.reduce((acc: number, item: any) => acc + (Number(item.weight || 0.5) * (item.quantity || 1)), 0);
      const totalValue = Number(order.total_amount || 0);

      const isProduction = Deno.env.get("TOTAL_EXPRESS_ENV") !== "homologation";
      const ticketUrl = isProduction
        ? "https://apis.totalexpress.com.br/ics-ticket-lv/v1/ticket"
        : "https://apis-qa.totalexpress.com.br/ics-ticket-lv/v1/ticket";

      const icsAuth = btoa(`${TOTAL_EXPRESS_USER}:${TOTAL_EXPRESS_PASSWORD}`);

      const ticketBody = {
        servicoTipo: 7,
        entregaTipo: 0,
        peso: totalWeight,
        volumes: Math.max(1, totalVolumes),
        condicaoFrete: "CIF",
        pedido: String(order.reference_id || order.id).substring(0, 20),
        natureza: "Produtos",
        isencaoIcms: 0,
        destinatario: {
          nome: String(order.customer_name || 'Cliente').substring(0, 40),
          cpfCnpj: String(order.customer_cpf || order.shipping_address?.cpf || '').replace(/\D/g, '').substring(0, 14),
          endereco: String(order.shipping_address?.street || order.shipping_address || '').substring(0, 80),
          numero: String(order.shipping_address?.number || 'S/N').substring(0, 10),
          complemento: String(order.shipping_address?.complement || '').substring(0, 60),
          bairro: String(order.shipping_address?.locality || order.shipping_address?.neighborhood || '').substring(0, 40),
          city: String(order.shipping_address?.city || '').substring(0, 40),
          estado: String(order.shipping_address?.region_code || order.shipping_address?.state || '').substring(0, 2),
          cep: String(order.shipping_address?.postal_code || order.postal_code || '').replace(/\D/g, '').substring(0, 8),
          email: String(order.customer_email || '').substring(0, 60),
          ddd: String(order.customer_phone || order.shipping_address?.phone || '').replace(/\D/g, '').substring(0, 2),
          telefone: String(order.customer_phone || order.shipping_address?.phone || '').replace(/\D/g, '').substring(2, 11),
        },
        documentosFiscais: [
          {
            tipo: "00",
            numero: String(order.reference_id || order.id).replace(/\D/g, '').substring(0, 9),
            data: new Date().toISOString().split('T')[0],
            valorTotal: totalValue,
            valorProdutos: totalValue
          }
        ]
      };

      try {
        const response = await fetch(ticketUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${icsAuth}`,
            "ICS-Authorization": icsAuth,
            "User-Agent": "Lovable-Integration",
            "Accept": "application/json",
          },
          body: JSON.stringify(ticketBody),
        });

        const resultText = await response.text();
        console.log("Resposta Total Express REST:", resultText);

        let result;
        try {
          result = JSON.parse(resultText);
        } catch (e) {
          result = { raw: resultText };
        }

        if (response.ok && (result.protocolo || result.id)) {
          const protocol = result.protocolo || result.id;
          await supabase
            .from("orders")
            .update({ tracking_number: protocol, shipping_label_id: protocol })
            .eq("id", order.id);
        }

        return new Response(JSON.stringify({
          success: response.ok,
          data: result,
          protocol: result.protocolo || result.id || null,
          raw_response: resultText
        }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Erro na chamada REST Total Express:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ────────────────────────────────────────────────────────────────
    // AÇÃO: Cálculo de Frete via Total Express (SOAP API)
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

    const TOTAL_EXPRESS_USER = Deno.env.get("TOTAL_EXPRESS_USER");
    const TOTAL_EXPRESS_PASSWORD = Deno.env.get("TOTAL_EXPRESS_PASSWORD");
    const TOTAL_EXPRESS_REID = Deno.env.get("TOTAL_EXPRESS_REID") || "0";

    let shippingOptions: any[] = [];

    if (TOTAL_EXPRESS_USER && TOTAL_EXPRESS_PASSWORD) {
      try {
        console.log(`Calculando frete via Total Express para CEP ${cep}`);
        
        let totalWeight = 0;
        let totalValue = 0;
        if (items && items.length > 0) {
          items.forEach((item: any) => {
            const qty = item.quantity || 1;
            totalValue += (Number(item.price) || 0) * qty;
            totalWeight += (Number(item.weight) || 0.5) * qty;
          });
        } else {
          totalValue = 100;
          totalWeight = 0.5;
        }

        // SOAP Request for Total Express
        const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <calcularFrete xmlns="http://edi.totalexpress.com.br/webservice_calculo_frete.php">
      <reid>${TOTAL_EXPRESS_REID}</reid>
      <cep>${cep}</cep>
      <peso>${totalWeight.toFixed(2)}</peso>
      <valor>${totalValue.toFixed(2)}</valor>
    </calcularFrete>
  </soap:Body>
</soap:Envelope>`;

        const auth = btoa(`${TOTAL_EXPRESS_USER}:${TOTAL_EXPRESS_PASSWORD}`);
        const response = await fetch("https://edi.totalexpress.com.br/webservice_calculo_frete.php", {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "Authorization": `Basic ${auth}`,
            "SOAPAction": "http://edi.totalexpress.com.br/webservice_calculo_frete.php#calcularFrete"
          },
          body: soapRequest
        });

        const xmlResponse = await response.text();
        console.log("Total Express SOAP Response:", xmlResponse);

        // Parsing simples do XML de resposta (Regex para evitar dependências pesadas)
        const priceMatch = xmlResponse.match(/<ValorFrete>([\d,.]+)<\/ValorFrete>/);
        const deadlineMatch = xmlResponse.match(/<Prazo>(\d+)<\/Prazo>/);
        const nameMatch = xmlResponse.match(/<DescricaoServico>([^<]+)<\/DescricaoServico>/);

        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(",", "."));
          const days = deadlineMatch ? parseInt(deadlineMatch[1]) : 7;
          const serviceName = nameMatch ? nameMatch[1] : "Total Express";

          shippingOptions.push({
            id: "total_express_standard",
            name: serviceName,
            carrier: "Total Express",
            carrier_code: "TEX",
            price: price,
            currency: "BRL",
            estimated_days: days + 2, // Margem de segurança
            description: `Entrega via Total Express`,
          });
        }
      } catch (e) {
        console.error("Erro ao chamar Total Express SOAP:", e);
      }
    }

    // Fallback para Frenet se a Total Express falhar ou não estiver configurada
    if (shippingOptions.length === 0) {
      console.log("Usando Frenet como fallback...");
      const FRENET_TOKEN = Deno.env.get("FRENET_TOKEN");
      if (FRENET_TOKEN) {
        try {
          // Re-calculando valores para Frenet
          let totalValue = 0;
          let itemsArray: any[] = [];
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
          } else {
            totalValue = 100;
            itemsArray.push({ Weight: 0.5, Length: 15, Width: 15, Height: 10, Quantity: 1 });
          }

          const frenetResponse = await fetch("https://api.frenet.com.br/shipping/quote", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "token": FRENET_TOKEN
            },
            body: JSON.stringify({
              SellerCEP: ORIGIN_CEP,
              RecipientCEP: cep,
              ShipmentInvoiceValue: totalValue,
              ShippingItemArray: itemsArray
            }),
          });

          const data = await frenetResponse.json();
          if (data.ShippingSevicesArray && data.ShippingSevicesArray.length > 0) {
            shippingOptions = data.ShippingSevicesArray
              .filter((s: any) => !s.Error)
              .map((s: any) => ({
                id: `frenet_${s.ServiceCode}`,
                name: s.ServiceDescription,
                carrier: s.Carrier,
                carrier_code: s.CarrierCode,
                price: parseFloat(s.ShippingPrice),
                currency: "BRL",
                estimated_days: parseInt(s.DeliveryTime) + 2,
                description: `Entrega via ${s.Carrier}`,
              }));
          }
        } catch (e) {
          console.error("Erro no fallback da Frenet:", e);
        }
      }
    }

    // Fallback final
    if (shippingOptions.length === 0) {
      shippingOptions.push({
        id: "standard_shipping",
        name: "Envio padrão",
        carrier: "Padrão",
        carrier_code: "STD",
        price: 25.0,
        currency: "BRL",
        estimated_days: 7,
        description: "Envio padrão: 7 dias úteis",
      });
    }

    return new Response(JSON.stringify({
      postal_code: cep,
      shipping_options: shippingOptions,
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
