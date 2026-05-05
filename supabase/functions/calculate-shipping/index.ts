import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOTAL_EXPRESS_USER = Deno.env.get("TOTAL_EXPRESS_USER");
const TOTAL_EXPRESS_PASSWORD = Deno.env.get("TOTAL_EXPRESS_PASSWORD");
const TOTAL_EXPRESS_REID = Deno.env.get("TOTAL_EXPRESS_REID");
// QuotaGuard URL removed as requested for free tier
const ORIGIN_CEP = "07063-000";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, order, postal_code, items } = body;

    // Se a ação for registrar coleta (pós-pagamento)
    if (action === "register_collection" && order) {
      console.log("Iniciando Registro de Coleta na Total Express para o pedido:", order.id);
      
      const itemsList = order.order_items || [];
      const totalVolumes = itemsList.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
      const totalWeight = itemsList.reduce((acc: number, item: any) => acc + (Number(item.weight || 0.5) * (item.quantity || 1)), 0);
      const totalValue = Number(order.total_amount || 0);
      
      // Construir XML de RegistraColeta baseado no layout detalhado v24
      const registerXml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:RegistraColeta">
   <soapenv:Header/>
   <soapenv:Body>
      <urn:RegistraColeta>
         <RegistraColetaRequest>
            <Encomendas>
               <item>
                  <TipoServico>1</TipoServico>
                  <TipoEntrega>0</TipoEntrega>
                  <Peso>${totalWeight.toFixed(2)}</Peso>
                  <Volumes>${totalVolumes}</Volumes>
                  <CondFrete>CIF</CondFrete>
                  <Pedido>${(order.reference_id || order.id).substring(0, 20)}</Pedido>
                  <Natureza>Produtos de Informatica</Natureza>
                  <IsencaoIcms>0</IsencaoIcms>
                  <DestNome>${(order.customer_name || 'Cliente').substring(0, 40)}</DestNome>
                  <DestCpfCnpj>${(order.customer_cpf || '').replace(/\D/g, '').substring(0, 14)}</DestCpfCnpj>
                  <DestEnd>${(order.shipping_address || '').substring(0, 80)}</DestEnd>
                  <DestEndNum>${(order.shipping_number || 'S/N').substring(0, 10)}</DestEndNum>
                  <DestCompl>${(order.shipping_complement || '').substring(0, 60)}</DestCompl>
                  <DestBairro>${(order.shipping_neighborhood || '').substring(0, 40)}</DestBairro>
                  <DestCidade>${(order.shipping_city || '').substring(0, 40)}</DestCidade>
                  <DestEstado>${(order.shipping_state || '').substring(0, 2)}</DestEstado>
                  <DestCep>${(order.postal_code || '').replace(/\D/g, '').substring(0, 8)}</DestCep>
                  <DestEmail>${(order.customer_email || '').substring(0, 60)}</DestEmail>
                  <DestDdd>${(order.customer_phone || '').replace(/\D/g, '').substring(0, 2)}</DestDdd>
                  <DestTelefone1>${(order.customer_phone || '').replace(/\D/g, '').substring(2, 11)}</DestTelefone1>
                  <DocFiscalO>
                     <item>
                        <NfoTipo>00</NfoTipo>
                        <NfoNumero>${(order.reference_id || order.id).replace(/\D/g, '').substring(0, 9)}</NfoNumero>
                        <NfoData>${new Date().toISOString().split('T')[0]}</NfoData>
                        <NfoValTotal>${totalValue.toFixed(2)}</NfoValTotal>
                        <NfoValProd>${totalValue.toFixed(2)}</NfoValProd>
                     </item>
                  </DocFiscalO>
               </item>
            </Encomendas>
         </RegistraColetaRequest>
      </urn:RegistraColeta>
   </soapenv:Body>
</soapenv:Envelope>`;

      const response = await fetch("https://edi.totalexpress.com.br/webservice24.php", {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "urn:RegistraColeta#RegistraColeta",
          "User-Agent": "Mozilla/5.0"
        },
        body: registerXml,
      });

      const resultText = await response.text();
      console.log("Total Express Register Response:", resultText);

      // Extract Protocol Number if success
      const protocolMatch = resultText.match(/<NumProtocolo.*?>(.*?)<\/NumProtocolo>/);
      const protocol = protocolMatch ? protocolMatch[1] : null;

      if (protocol) {
        console.log("Coleta registrada com sucesso. Protocolo:", protocol);
        // We could also update the order table here to store the protocol
      } else {
        console.warn("Possível falha no registro da coleta ou formato inesperado.");
      }

      return new Response(JSON.stringify({ 
        success: !!protocol, 
        protocol,
        raw_result: resultText 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // BMP Action: Input Validation
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

    // BMP Action: Weight & Dimensions Calculation
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

    // BMP Action: SOAP Request Generation
    // Note: Some Total Express implementations require Peso, Altura, Largura, Comprimento separately
    // The current version uses a simplified CalcFrete, but we should check if they need the dimensions.
    // Based on the manual provided:
    // Endpoint: https://edi.totalexpress.com.br/webservice24.php?wsdl
    // SOAP 1.1 UTF-8
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

    // BMP Action: Web Service Integration (Total Express)
    let retries = 0;
    const maxRetries = 2;
    let response;
    let xmlText = "";

    while (retries <= maxRetries) {
      try {
        console.log(`Fetching from Total Express (Attempt ${retries + 1})...`);
        
        const fetchOptions: any = {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "urn:TotalExpress#CalcFrete",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          body: soapRequest,
        };

        // Proxy logic removed to keep project on free tier

        response = await fetch(totalExpressUrl, fetchOptions);

        xmlText = await response.text();
        console.log(`Response Status: ${response.status}`);
        
        if (response.status === 429 || xmlText.includes("Erro 429") || xmlText.includes("Muitas solicitações") || response.status === 403) {
          console.warn(`Total Express Rate Limit or WAF (Status ${response.status}) hit. Retry ${retries + 1}/${maxRetries}`);
          retries++;
          if (retries <= maxRetries) {
            const waitTime = 2000 * retries;
            console.log(`Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        break;
      } catch (e) {
        console.error(`Total Express fetch attempt ${retries} failed:`, e);
        retries++;
        if (retries > maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log("Total Express Final Response:", xmlText);

    if (xmlText) {
      // BMP Action: XML Response Processing
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
        throw new Error(`Total Express: ${erroMatch[1]}`);
      }
    }

    // BMP Action: Result Delivery (JSON Response)
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
    console.error("Shipping calculation error:", error);
    return new Response(JSON.stringify({ error: "Erro ao calcular frete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
