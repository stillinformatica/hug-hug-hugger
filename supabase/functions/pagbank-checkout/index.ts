import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders, json, readBody } from "../_shared/security.ts";
import { catalogItems } from "../_shared/payment-rules.ts";
const addressSchema = z.object({
  street:z.string().trim().min(1).max(160), number:z.string().trim().min(1).max(20), complement:z.string().max(40).optional(),
  locality:z.string().trim().min(1).max(60),city:z.string().trim().min(1).max(60),region_code:z.string().regex(/^[A-Z]{2}$/),
  postal_code:z.string().regex(/^\d{8}$/),shipping_service_id:z.string().min(1).max(50),amount:z.number().finite().nonnegative().optional()
});
const schema = z.object({items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(100)})).min(1).max(100),
 customer:z.object({name:z.string().trim().min(3).max(120),email:z.string().trim().email().max(254),phone:z.string().regex(/^\d{10,11}$/),cpf:z.string().regex(/^\d{11}$/)}),shipping:addressSchema});

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function notifyWhatsApp(message: string): Promise<void> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const to = (Deno.env.get("WHATSAPP_RECIPIENT_PHONE") || "").replace(/\D/g, "");
  if (!token || !phoneNumberId || !to) {
    console.warn("Notificação WhatsApp não enviada: configure as credenciais e o destinatário.");
    return;
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    }),
  });
  if (!response.ok) console.error("Falha ao enviar notificação WhatsApp", response.status);
}

Deno.serve(async req => {
 if(req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
 try {
  const parsed=schema.safeParse(await readBody(req));
  if(!parsed.success) return json({error:"Dados inválidos",fields:parsed.error.flatten().fieldErrors},400);
  const {customer,shipping}=parsed.data;
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("PAGBANK_TOKEN");
  if(!url||!key||!token) return json({error:"Configuração incompleta"},503);
  const db=createClient(url,key);
  const catalog=await db.from("announced_products").select("id,name,price,weight,width,height,length").in("id",parsed.data.items.map(i=>i.productId));
  if(catalog.error) throw new Error("Catálogo indisponível");
  let items;
  try {items=catalogItems(parsed.data.items,catalog.data||[]);}catch{return json({error:"Produto indisponível ou quantidade inválida"},400);}
  // Requote freight on the server: browser-supplied shipping prices are not trusted.
  const quote=await db.functions.invoke("calculate-shipping",{body:{postal_code:shipping.postal_code,items:items.map(i=>({...i,price:i.unit_amount}))}});
  if(quote.error) return json({error:"Não foi possível confirmar o frete"},502);
  const options=quote.data?.shipping_options;
  const selected=Array.isArray(options)?options.find((o:{id:string})=>o.id===shipping.shipping_service_id):undefined;
  if(!selected||!Number.isFinite(Number(selected.price))||Number(selected.price)<0) return json({error:"Selecione novamente o frete"},400);
  const freight=Math.round(Number(selected.price)*100);
  const referenceId=`STILL${crypto.randomUUID().replaceAll("-","")}`;
  const orderItems=items.map(i=>({reference_id:i.id,name:i.name.slice(0,64),quantity:i.quantity,unit_amount:Math.round(i.unit_amount*100)}));
  const total=orderItems.reduce((s,i)=>s+i.quantity*i.unit_amount,freight);
  const payload={reference_id:referenceId,items:orderItems,soft_descriptor:"STILLINF",payment_methods:[{type:"CREDIT_CARD"},{type:"DEBIT_CARD"},{type:"BOLETO"},{type:"PIX"}],
   redirect_urls:{return_url:"https://stillinformatica.com.br/pedido-concluido",back_url:"https://stillinformatica.com.br/checkout"},notification_urls:[`${url}/functions/v1/pagbank-webhook`],
   customer:{name:customer.name,email:customer.email,tax_id:customer.cpf,phones:[{country:"55",area:customer.phone.slice(0,2),number:customer.phone.slice(2),type:customer.phone.length===11?"MOBILE":"HOME"}]},
   shipping:{type:"FIXED",amount:freight,address:{street:shipping.street,number:shipping.number,complement:shipping.complement||"N/A",locality:shipping.locality,city:shipping.city,region_code:shipping.region_code,postal_code:shipping.postal_code,country:"BRA"}}};
  const response=await fetch("https://api.pagseguro.com/checkouts",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,"x-api-version":"4.0"},body:JSON.stringify(payload)});
  if(!response.ok){console.error("PagBank checkout failed",response.status);return json({error:"PagBank recusou a criação do checkout",status_code:response.status},502);}
  const data=await response.json();
  const paymentUrl=data.links?.find((l:{rel:string})=>l.rel==="PAY")?.href;
  if(typeof paymentUrl!=="string"||!/^https:\/\/(pagamento\.pagbank\.com\.br|checkout\.pagseguro\.uol\.com\.br)\//.test(paymentUrl)) return json({error:"Link de pagamento inválido"},502);
  const saved=await db.from("orders").insert({reference_id:referenceId,pagbank_id:data.id,status:"CREATED",customer_name:customer.name,customer_email:customer.email,total_amount:total/100,items,shipping_address:{...shipping,amount:freight/100,cpf:customer.cpf,phone:customer.phone}});
  if(saved.error) return json({error:"Não foi possível registrar o pedido"},500);

  const sellerEmail = Deno.env.get("ORDER_NOTIFICATION_EMAIL") || "stillinformatica@stillinformatica.com.br";
  const itemSummary = items.map((item) => `${item.quantity}x ${item.name}`).join(", ");
  const totalText = (total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const notificationMessage = `Novo pedido recebido\\nPedido: ${referenceId}\\nCliente: ${customer.name}\\nE-mail: ${customer.email}\\nItens: ${itemSummary}\\nTotal: ${totalText}`;

  try {
   const { error: emailError } = await db.functions.invoke("send-email", { body: {
    from: "Still Informatica <onboarding@resend.dev>",
    reply_to: sellerEmail,
    to: sellerEmail,
    subject: `Novo pedido recebido — ${referenceId}`,
    html: `<h1>Novo pedido recebido</h1><p><strong>Pedido:</strong> ${escapeHtml(referenceId)}</p><p><strong>Cliente:</strong> ${escapeHtml(customer.name)}</p><p><strong>E-mail:</strong> ${escapeHtml(customer.email)}</p><p><strong>Itens:</strong> ${escapeHtml(itemSummary)}</p><p><strong>Total:</strong> ${escapeHtml(totalText)}</p>`,
   }});
   if (emailError) console.error("Falha ao enviar e-mail de novo pedido");
  } catch { console.error("Falha ao enviar e-mail de novo pedido"); }

  try { await notifyWhatsApp(notificationMessage); }
  catch { console.error("Falha ao enviar WhatsApp de novo pedido"); }

  return json({id:data.id,payment_url:paymentUrl,reference_id:referenceId,status:"CREATED"});
 }catch(error){if(error instanceof Response)return error;console.error("Checkout failed:",error instanceof Error?error.message:String(error));return json({error:"Não foi possível iniciar o pagamento"},500);}
});
