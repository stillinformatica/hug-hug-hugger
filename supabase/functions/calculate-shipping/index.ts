import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOTAL_EXPRESS_USER = Deno.env.get("TOTAL_EXPRESS_USER");
const TOTAL_EXPRESS_PASSWORD = Deno.env.get("TOTAL_EXPRESS_PASSWORD");
const TOTAL_EXPRESS_REID = Deno.env.get("TOTAL_EXPRESS_REID");
const ORIGIN_CEP = "07063-000";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, order, postal_code, items } = body;

    // Se a ação for registrar coleta (Smart Label REST API)
    if (action === "register_collection" && order) {
      console.log("Iniciando Registro de Coleta (Smart Label REST) na Total Express para o pedido:", order.id);
      
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const itemsList = order.items || order.order_items || [];
      const totalVolumes = itemsList.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
      const totalWeight = itemsList.reduce((acc: number, item: any) => acc + (Number(item.weight || 0.5) * (item.quantity || 1)), 0);
      const totalValue = Number(order.total_amount || 0);

      const isProduction = Deno.env.get("TOTAL_EXPRESS_ENV") !== "homologation"; // Padrão agora é produção, a menos que explicitamente homologação
      const ticketUrl = isProduction 
        ? "https://apis.totalexpress.com.br/ics-ticket-lv/v1/ticket"
        : "https://apis-qa.totalexpress.com.br/ics-ticket-lv/v1/ticket";

      // Autenticação ICS (usuario:senha em Base64 conforme especificação ICS)
      const icsAuth = btoa(`${TOTAL_EXPRESS_USER}:${TOTAL_EXPRESS_PASSWORD}`);

      // Mapeamento para o payload JSON do Smart Label (Ticket)
      const ticketBody = {
        servicoTipo: 7, // Expresso (7) para coincidir com a consulta EXP.
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
            tipo: "00", // NF-e
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
            "ICS-Authorization": icsAuth,
            "User-Agent": "Lovable-Integration",
            "Accept": "application/json",
            "Connection": "keep-alive"
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
          // Salvar o protocolo no pedido
          await supabase
            .from("orders")
            .update({ 
              tracking_number: protocol,
              shipping_label_id: protocol 
            })
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

    // Ação: Cálculo de Frete (Permanece SOAP conforme documento)
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

    // BMP Action: Address Lookup
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

    let totalWeight = 0;
    let totalValue = 0;
    let maxL = 0;
    let maxW = 0;
    let sumH = 0;

    if (items && items.length > 0) {
      items.forEach((item: any) => {
        const qty = item.quantity || 1;
        const w = Number(item.weight) || 0.5;
        totalWeight += w * qty;
        totalValue += (Number(item.price) || 0) * qty;
        
        maxL = Math.max(maxL, Number(item.length) || 15);
        maxW = Math.max(maxW, Number(item.width) || 15);
        sumH += (Number(item.height) || 10) * qty;
      });
    } else {
      totalWeight = 0.5;
      totalValue = 100;
      maxL = 15;
      maxW = 15;
      sumH = 10;
    }

    const finalWeight = Math.max(totalWeight, 0.1);
    const finalLength = Math.max(maxL, 15);
    const finalWidth = Math.max(maxW, 15);
    const finalHeight = Math.max(sumH, 2);

    console.log(`Calculando frete para CEP ${cep}: Peso=${finalWeight}kg, Valor=${totalValue}`);

    const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="urn:TotalExpress">
   <soapenv:Header/>
   <soapenv:Body>
      <web:CalcFrete>
         <web:usuario>${TOTAL_EXPRESS_USER}</web:usuario>
         <web:senha>${TOTAL_EXPRESS_PASSWORD}</web:senha>
         <web:reid>${TOTAL_EXPRESS_REID}</web:reid>
         <web:cepOrigem>${ORIGIN_CEP.replace(/\D/g, "")}</web:cepOrigem>
         <web:cepDestino>${cep}</web:cepDestino>
         <web:peso>${finalWeight.toFixed(2)}</web:peso>
         <web:vlrMercadoria>${totalValue.toFixed(2)}</web:vlrMercadoria>
         <web:tipoServico>EXP</web:tipoServico>
      </web:CalcFrete>
   </soapenv:Body>
</soapenv:Envelope>`;

    const totalExpressUrl = "https://edi.totalexpress.com.br/webservice24.php?wsdl";
    let shippingOptions = [];

    let retries = 0;
    const maxRetries = 2;
    let response;
    let xmlText = "";

    while (retries <= maxRetries) {
      try {
        const fetchOptions: any = {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "urn:TotalExpress#CalcFrete",
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
            "Connection": "keep-alive"
          },
          body: soapRequest,
        };

        response = await fetch(totalExpressUrl, fetchOptions);
        xmlText = await response.text();
        
        if (response.status === 429 || response.status === 403) {
          retries++;
          if (retries <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * retries));
            continue;
          }
        }
        break;
      } catch (e) {
        retries++;
        if (retries > maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (xmlText) {
      const valorFreteMatch = xmlText.match(/<ValorFrete>(.*?)<\/ValorFrete>/);
      const prazoMatch = xmlText.match(/<PrazoEntrega>(.*?)<\/PrazoEntrega>/);
      
      if (valorFreteMatch) {
        shippingOptions.push({
          id: "total_express_exp",
          name: "Total Express (Expresso)",
          price: parseFloat(valorFreteMatch[1].replace(",", ".")),
          currency: "BRL",
          estimated_days: parseInt(prazoMatch ? prazoMatch[1] : "5") + 2,
          description: "Entrega via Total Express",
        });
      }
    }

    if (shippingOptions.length === 0) {
      shippingOptions.push({
        id: "standard_shipping",
        name: "Envio padrão",
        price: 25.0,
        currency: "BRL",
        estimated_days: 7,
        description: "Envio padrão: 7 dias úteis - R$25,00",
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
    console.error("Erro no cálculo de frete:", error);
    return new Response(JSON.stringify({ error: "Erro ao calcular frete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
