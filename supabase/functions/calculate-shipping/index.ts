import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOTAL_EXPRESS_USER = Deno.env.get("TOTAL_EXPRESS_USER");
const TOTAL_EXPRESS_PASSWORD = Deno.env.get("TOTAL_EXPRESS_PASSWORD");
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

    // Default values if product doesn't have weight/dims
    // Using small defaults (0.5kg, 15x15x15)
    const totalWeight = items?.reduce((acc: number, item: any) => acc + (item.weight || 0.5) * (item.quantity || 1), 0) || 0.5;
    
    // Simple volume calculation for Total Express (summing heights or taking max of dimensions)
    const maxWidth = Math.max(...(items?.map((i: any) => i.width || 15) || [15]));
    const maxLength = Math.max(...(items?.map((i: any) => i.length || 15) || [15]));
    const totalHeight = items?.reduce((acc: number, item: any) => acc + (item.height || 10) * (item.quantity || 1), 0) || 10;

    // Total Express SOAP Request for CalcFrete
    const soapRequest = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="https://www.totalexpress.com.br/wms/WebServiceV1">
         <soapenv:Header/>
         <soapenv:Body>
            <web:CalcFrete>
               <web:usuario>${TOTAL_EXPRESS_USER}</web:usuario>
               <web:senha>${TOTAL_EXPRESS_PASSWORD}</web:senha>
               <web:cepOrigem>${ORIGIN_CEP.replace(/\D/g, "")}</web:cepOrigem>
               <web:cepDestino>${cep}</web:cepDestino>
               <web:peso>${totalWeight.toFixed(2)}</web:peso>
               <web:vlrMercadoria>${items?.reduce((acc: number, item: any) => acc + (item.price || 0) * (item.quantity || 1), 0) || 100}</web:vlrMercadoria>
               <web:tipoServico>EXP</web:tipoServico>
            </web:CalcFrete>
         </soapenv:Body>
      </soapenv:Envelope>
    `;

    // Note: URL might vary depending on environment (Homologation vs Production)
    // Production usually: https://www.totalexpress.com.br/wms/WebServiceV1
    const totalExpressUrl = "https://www.totalexpress.com.br/wms/WebServiceV1";
    
    let shippingOptions = [];

    try {
      const response = await fetch(totalExpressUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "https://www.totalexpress.com.br/wms/WebServiceV1/CalcFrete"
        },
        body: soapRequest,
      });

      const xmlText = await response.text();
      console.log("Total Express Response:", xmlText);

      // Simple XML parsing for the specific fields we need
      const valorFreteMatch = xmlText.match(/<ValorFrete>(.*?)<\/ValorFrete>/);
      const prazoMatch = xmlText.match(/<PrazoEntrega>(.*?)<\/PrazoEntrega>/);
      const erroMatch = xmlText.match(/<Erro>(.*?)<\/Erro>/);
      const erroCodMatch = xmlText.match(/<CodigoErro>(.*?)<\/CodigoErro>/);

      if (valorFreteMatch) {
        shippingOptions.push({
          id: "total_express_exp",
          name: "Total Express (Expresso)",
          price: parseFloat(valorFreteMatch[1].replace(",", ".")),
          currency: "BRL",
          estimated_days: parseInt(prazoMatch ? prazoMatch[1] : "5") + 2, // adding buffer
          description: "Entrega via Total Express",
        });
      } else if (erroMatch && erroCodMatch && erroCodMatch[1] !== "0") {
        console.warn("Total Express API Error:", erroMatch[1]);
      }
    } catch (e) {
      console.error("Total Express integration error:", e);
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
