import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { postal_code, items } = await req.json();

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

    // Get address data for the UI
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

    // Product dimensions and weight calculation
    let totalWeight = 0;
    let totalValue = 0;
    
    // We'll calculate a bounding box or sum of volumes for Total Express
    // For simplicity with multiple items, we'll sum weights and use the largest dimensions as a base
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

    // Ensure minimum dimensions for Total Express if needed
    const finalWeight = Math.max(totalWeight, 0.1);
    const finalLength = Math.max(maxL, 15);
    const finalWidth = Math.max(maxW, 15);
    const finalHeight = Math.max(sumH, 2);

    console.log(`Calculating shipping for CEP ${cep}: Weight=${finalWeight}kg, L=${finalLength}, W=${finalWidth}, H=${finalHeight}, Value=${totalValue}`);

    // Total Express SOAP Request for CalcFrete
    // Note: Some Total Express implementations require Peso, Altura, Largura, Comprimento separately
    // The current version uses a simplified CalcFrete, but we should check if they need the dimensions.
    // Based on common Total Express docs, CalcFrete usually takes these parameters:
    const soapRequest = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="https://www.totalexpress.com.br/wms/WebServiceV1">
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
      </soapenv:Envelope>
    `;

    // Homologation: https://awshomolog.totalexpress.com.br/wms/WebServiceV1
    const totalExpressUrl = "https://awshomolog.totalexpress.com.br/wms/WebServiceV1";
    let shippingOptions = [];

    // Maximum 3 retries for 429 errors
    let retries = 0;
    const maxRetries = 2;
    let response;
    let xmlText = "";

    while (retries <= maxRetries) {
      try {
        response = await fetch(totalExpressUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "https://www.totalexpress.com.br/wms/WebServiceV1/CalcFrete"
          },
          body: soapRequest,
        });

        xmlText = await response.text();
        
        if (response.status === 429 || xmlText.includes("Erro 429") || xmlText.includes("Muitas solicitações")) {
          console.warn(`Total Express Rate Limit (429) hit. Retry ${retries + 1}/${maxRetries}`);
          retries++;
          if (retries <= maxRetries) {
            // Wait 1-2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }
        }
        break;
      } catch (e) {
        console.error(`Total Express fetch attempt ${retries} failed:`, e);
        retries++;
        if (retries > maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log("Total Express Response:", xmlText);
    console.log("Total Express Status:", response?.status);

    if (xmlText) {
      // Simple XML parsing for the specific fields we need
      const valorFreteMatch = xmlText.match(/<ValorFrete>(.*?)<\/ValorFrete>/);
      const prazoMatch = xmlText.match(/<PrazoEntrega>(.*?)<\/PrazoEntrega>/);
      const erroMatch = xmlText.match(/<Erro>(.*?)<\/Erro>/);
      const erroCodMatch = xmlText.match(/<CodigoErro>(.*?)<\/CodigoErro>/);
      
      const isHtmlError = xmlText.includes("<html") || xmlText.includes("<!DOCTYPE html");

      if (valorFreteMatch) {
        shippingOptions.push({
          id: "total_express_exp",
          name: "Total Express (Expresso)",
          price: parseFloat(valorFreteMatch[1].replace(",", ".")),
          currency: "BRL",
          estimated_days: parseInt(prazoMatch ? prazoMatch[1] : "5") + 2, // adding buffer
          description: "Entrega via Total Express",
        });
      } else if (isHtmlError) {
        console.warn("Total Express returned HTML (likely Rate Limit or WAF error)");
      } else if (erroMatch && erroCodMatch && erroCodMatch[1] !== "0") {
        console.warn(`Total Express API Error ${erroCodMatch[1]}: ${erroMatch[1]}`);
      }
    }

    // Fallback if Total Express fails or returns no options
    if (shippingOptions.length === 0) {
      shippingOptions.push({
        id: "standard_shipping",
        name: "Envio Padrão",
        price: 25.0,
        currency: "BRL",
        estimated_days: 7,
        description: "Opção de envio padrão (contingência)",
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
    console.error("Shipping calculation error:", error);
    return new Response(JSON.stringify({ error: "Erro ao calcular frete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
