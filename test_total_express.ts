const TOTAL_EXPRESS_USER = "84216stillin-prod";
const TOTAL_EXPRESS_PASSWORD = "5aOWzm3V1v";
const TOTAL_EXPRESS_REID = "1"; 
const ORIGIN_CEP = "07063000";
const cep = "01310100";
const finalWeight = 1.0;
const totalValue = 100.0;

const soapRequest = '<?xml version="1.0" encoding="utf-8"?>' +
'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="urn:TotalExpress">' +
'   <soapenv:Header/>' +
'   <soapenv:Body>' +
'      <web:CalcFrete>' +
'         <web:usuario>' + TOTAL_EXPRESS_USER + '</web:usuario>' +
'         <web:senha>' + TOTAL_EXPRESS_PASSWORD + '</web:senha>' +
'         <web:reid>' + TOTAL_EXPRESS_REID + '</web:reid>' +
'         <web:cepOrigem>' + ORIGIN_CEP + '</web:cepOrigem>' +
'         <web:cepDestino>' + cep + '</web:cepDestino>' +
'         <web:peso>' + finalWeight.toFixed(2) + '</web:peso>' +
'         <web:vlrMercadoria>' + totalValue.toFixed(2) + '</web:vlrMercadoria>' +
'         <web:tipoServico>EXP</web:tipoServico>' +
'      </web:CalcFrete>' +
'   </soapenv:Body>' +
'</soapenv:Envelope>';

const response = await fetch("https://edi.totalexpress.com.br/webservice24.php", {
  method: "POST",
  headers: {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction": "urn:TotalExpress#CalcFrete",
    "User-Agent": "Mozilla/5.0"
  },
  body: soapRequest,
});

console.log("Status:", response.status);
console.log("Body:", await response.text());
