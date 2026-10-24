import { matchesPayment } from "../_shared/payment-rules.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAGBANK_PROD_WS = "https://ws.pagseguro.uol.com.br";
const SELLER_EMAIL = "stillinformatica@stillinformatica.com.br";
const DEFAULT_FROM = "Still Informatica <onboarding@resend.dev>";

const paymentConfirmedStatuses = new Set(["PAID", "AVAILABLE"]);

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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value: unknown): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildItemsHtml(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return "<li>Itens do pedido confirmados.</li>";
  return items.map((item) => {
    const data = item as Record<string, unknown>;
    const quantity = Number(data.quantity || 1);
    const name = escapeHtml(data.name || "Produto");
    const unitAmount = formatCurrency(data.unit_amount || data.price || 0);
    return `<li>${quantity}x ${name} — ${unitAmount}</li>`;
  }).join("");
}

function buildAddressHtml(address: unknown): string {
  const data = (address || {}) as Record<string, unknown>;
  const line1 = `${escapeHtml(data.street)}, ${escapeHtml(data.number)} ${escapeHtml(data.complement)}`.trim();
  const line2 = `${escapeHtml(data.locality || data.neighborhood)} - ${escapeHtml(data.city)}/${escapeHtml(data.region_code || data.state)}`.trim();
  const postalCode = escapeHtml(data.postal_code);
  return `${line1 || "Endereço informado no checkout"}<br>${line2}<br>CEP: ${postalCode}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing environment variables");
      return new Response(
        JSON.stringify({ error: "Configuração incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const bodyText = await req.text();
    if (bodyText.length > 100000) return new Response("Payload too large", {status:413,headers:corsHeaders});

    let notificationData: any = null;
    let referenceId: string | null = null;
    let status: string | null = null;
    let pagbankId: string | null = null;

    // Try to parse as JSON first (v4 Orders API)
    try {
      notificationData = JSON.parse(bodyText);
      console.log("Parsed as JSON (v4)");

      // Notification fields are hints only. Resolve the stored checkout and verify with PagBank.
      if (!PAGBANK_TOKEN || typeof notificationData.reference_id !== "string" || notificationData.reference_id.length > 100) return new Response("Invalid notification", {status:400,headers:corsHeaders});
      const { data: stored } = await supabase.from("orders").select("reference_id,pagbank_id,total_amount").eq("reference_id",notificationData.reference_id).maybeSingle();
      if (!stored?.pagbank_id || !/^(CHEC|ORDE)_[A-Za-z0-9-]+$/.test(stored.pagbank_id)) return new Response("Unknown checkout",{status:400,headers:corsHeaders});
      const kind = stored.pagbank_id.startsWith("CHEC_") ? "checkouts" : "orders";
      const verification = await fetch(`https://api.pagseguro.com/${kind}/${encodeURIComponent(stored.pagbank_id)}`,{headers:{Authorization:`Bearer ${PAGBANK_TOKEN}`,"x-api-version":"4.0"}});
      if (!verification.ok) return new Response("Payment verification unavailable",{status:502,headers:corsHeaders});
      const checkout = await verification.json();
      let verified = checkout;
      if (kind === "checkouts") {
        const paidOrder = Array.isArray(checkout.orders) ? checkout.orders.find((o: {id?:string}) => o.id === notificationData.id) : null;
        if (!paidOrder?.id || !/^ORDE_[A-Za-z0-9-]+$/.test(paidOrder.id)) return new Response("Payment not linked to checkout",{status:409,headers:corsHeaders});
        const orderResponse=await fetch(`https://api.pagseguro.com/orders/${encodeURIComponent(paidOrder.id)}`,{headers:{Authorization:`Bearer ${PAGBANK_TOKEN}`}});
        if (!orderResponse.ok) return new Response("Order verification unavailable",{status:502,headers:corsHeaders});
        verified=await orderResponse.json();
      }
      const charges=Array.isArray(verified.charges)?verified.charges:[];
      const paid=charges.filter((c:{status:string})=>paymentConfirmedStatuses.has(c.status));
      const amount=paid.reduce((sum:number,c:{amount?:{value?:number}})=>sum+Number(c.amount?.value||0),0);
      if (paid.length && !matchesPayment(stored,{reference_id:verified.reference_id,id:checkout.id,amount})) return new Response("Payment mismatch",{status:409,headers:corsHeaders});
      if (verified.reference_id !== stored.reference_id) return new Response("Reference mismatch",{status:409,headers:corsHeaders});
      referenceId=stored.reference_id;
      pagbankId=stored.pagbank_id;
      status=paid.length ? "PAID" : charges[0]?.status;
      notificationData={id:verified.id,reference_id:verified.reference_id,status};
    } catch (e) {
      // Not JSON, check if it's form-encoded (v2/v3)
      console.log("Not JSON, checking form-encoded...");
      const params = new URLSearchParams(bodyText);
      const notificationCode = params.get("notificationCode");
      const notificationType = params.get("notificationType");

      if (notificationCode && notificationType === "transaction") {
        if (!PAGBANK_TOKEN) return new Response("Payment verification unavailable", {status:503,headers:corsHeaders});
        if (!/^[A-Za-z0-9-]{1,100}$/.test(notificationCode)) return new Response("Invalid code",{status:400,headers:corsHeaders});
        
        const response = await fetch(
          `${PAGBANK_PROD_WS}/v3/transactions/notifications/${encodeURIComponent(notificationCode)}?email=${encodeURIComponent(Deno.env.get("PAGBANK_EMAIL") || "")}&token=${encodeURIComponent(PAGBANK_TOKEN || "")}`,
          { method: "GET" }
        );

        if (response.ok) {
          const xmlText = await response.text();

          
          // Basic XML extraction (could use a library, but regex is faster for simple cases)
          const refMatch = xmlText.match(/<reference>(.*?)<\/reference>/);
          const statusMatch = xmlText.match(/<status>(.*?)<\/status>/);
          const codeMatch = xmlText.match(/<code>(.*?)<\/code>/);
          const amountMatch = xmlText.match(/<grossAmount>(.*?)<\/grossAmount>/);
          const legacyReference = refMatch?.[1];
          if (!legacyReference || !codeMatch?.[1] || !amountMatch?.[1]) return new Response("Incomplete payment verification", {status:409,headers:corsHeaders});
          const { data: legacyStored } = await supabase.from("orders").select("reference_id,pagbank_id,total_amount").eq("reference_id", legacyReference).maybeSingle();
          if (!legacyStored || !matchesPayment(legacyStored, { reference_id: legacyReference, id: codeMatch[1], amount: Math.round(Number(amountMatch[1]) * 100) })) return new Response("Payment mismatch", {status:409,headers:corsHeaders});

          referenceId = refMatch ? refMatch[1] : null;
          pagbankId = codeMatch ? codeMatch[1] : null;
          
          const statusMap: Record<string, string> = {
            "1": "WAITING_PAYMENT",
            "2": "IN_ANALYSIS",
            "3": "PAID",
            "4": "AVAILABLE",
            "5": "IN_DISPUTE",
            "6": "REFUNDED",
            "7": "CANCELLED",
            "8": "DEBITED",
            "9": "TEMPORARY_RETENTION",
          };
          
          status = statusMatch ? (statusMap[statusMatch[1]] || statusMatch[1]) : null;
        } else {
          console.error("Failed to fetch v3 details:", await response.text());
        }
      }
    }

    if (referenceId && status) {
      console.log(`Updating order ${referenceId} to status ${status}`);
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("status,pagbank_id,total_amount")
        .eq("reference_id", referenceId)
        .maybeSingle();
      if (!existingOrder || (pagbankId && existingOrder.pagbank_id !== pagbankId)) return new Response("Order mismatch",{status:409,headers:corsHeaders});
      const wasAlreadyConfirmed = existingOrder?.status
        ? paymentConfirmedStatuses.has(existingOrder.status)
        : false;
      
      const { data: updatedOrder, error } = await supabase
        .from("orders")
        .update({
          status: status,
          pagbank_id: pagbankId,
          notification_data: notificationData || bodyText,
          updated_at: new Date().toISOString(),
        })
        .eq("reference_id", referenceId)
        .eq("status", existingOrder.status)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Error updating order in database:", error);
      } else {
        console.log("Order updated successfully");
      }

      // Disparar confirmação quando o pagamento for aprovado pelo PagBank.
      if (updatedOrder && paymentConfirmedStatuses.has(status) && !wasAlreadyConfirmed) {
        console.log("Pagamento confirmado — disparando emails");

        const itemsHtml = buildItemsHtml(updatedOrder.items);
        const addrHtml = buildAddressHtml(updatedOrder.shipping_address);
        const total = formatCurrency(updatedOrder.total_amount);
        const customerEmail = String(updatedOrder.customer_email || "").trim();
        const customerName = escapeHtml(updatedOrder.customer_name || "Cliente");
        const reference = escapeHtml(updatedOrder.reference_id);

        if (customerEmail) {
          try {
            await supabase.functions.invoke("send-email", {
              body: {
                from: DEFAULT_FROM,
                reply_to: SELLER_EMAIL,
                to: customerEmail,
                subject: `Compra confirmada — Pedido ${updatedOrder.reference_id}`,
                html: `<h1>Compra confirmada!</h1>
                  <p>Olá ${customerName}, recebemos a confirmação do pagamento da sua compra.</p>
                  <p><strong>Pedido:</strong> ${reference}</p>
                  <p><strong>Total:</strong> ${total}</p>
                  <h3>Itens</h3><ul>${itemsHtml}</ul>
                  <h3>Endereço de entrega</h3><p>${addrHtml}</p>
                  <p>Em breve enviaremos as informações de envio e rastreamento.</p>
                  <p>Equipe Still Informatica</p>`
              }
            });
          } catch (e) { console.error("Erro email comprador:", e); }
        } else {
          console.warn("Pedido pago sem email do cliente; confirmação ao cliente não enviada.");
        }

        try {
          await supabase.functions.invoke("send-email", {
            body: {
              from: DEFAULT_FROM,
              reply_to: SELLER_EMAIL,
              to: SELLER_EMAIL,
              subject: `Nova venda paga — ${updatedOrder.reference_id} — ${total}`,
              html: `<h1>Nova venda confirmada</h1>
                <p><strong>Pedido:</strong> ${reference}</p>
                <p><strong>Cliente:</strong> ${customerName} (${escapeHtml(customerEmail)})</p>
                <p><strong>Total:</strong> ${total}</p>
                <h3>Itens</h3><ul>${itemsHtml}</ul>
                <h3>Entrega</h3><p>${addrHtml}</p>`
            }
          });
        } catch (e) { console.error("Erro email vendedor:", e); }

        const paidItems = Array.isArray(updatedOrder.items)
          ? updatedOrder.items.map((item) => {
              const data = item as Record<string, unknown>;
              return `${Number(data.quantity || 1)}x ${String(data.name || "Produto")}`;
            }).join(", ")
          : "Itens do pedido";
        try {
          await notifyWhatsApp(`Pagamento confirmado\\nPedido: ${updatedOrder.reference_id}\\nCliente: ${updatedOrder.customer_name || "Cliente"}\\nTotal: ${total}\\nItens: ${paidItems}`);
        } catch { console.error("Falha ao enviar WhatsApp de pagamento confirmado"); }

        if (updatedOrder.shipping_label_id) {
          console.log("Etiqueta já existente; pulando nova geração.");
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Gerar etiqueta Melhor Envio (cart + checkout + generate)
        try {
          const { data: shipData, error: shipErr } = await supabase.functions.invoke("calculate-shipping", {
            body: { action: "register_collection", order: updatedOrder }
          });
          console.log("Etiqueta result:", shipData, shipErr);

          if (shipData?.success) {
            const tracking = shipData.tracking ? escapeHtml(shipData.tracking) : null;
            const labelUrl = shipData.label_url || shipData.print_url || shipData.url || null;
            const labelLinkHtml = labelUrl
              ? `<p><a href="${escapeHtml(labelUrl)}">Abrir etiqueta para impressão</a></p>`
              : "<p>A etiqueta estará disponível no painel do Melhor Envio.</p>";

            // E-mail para o vendedor com a etiqueta
            try {
              await supabase.functions.invoke("send-email", {
                body: {
                  from: DEFAULT_FROM,
                  reply_to: SELLER_EMAIL,
                  to: SELLER_EMAIL,
                  subject: `Etiqueta gerada — Pedido ${updatedOrder.reference_id}`,
                  html: `<h1>Etiqueta pronta para envio</h1>
                    <p><strong>Pedido:</strong> ${reference}</p>
                    <p><strong>Cliente:</strong> ${customerName}</p>
                    ${tracking ? `<p><strong>Rastreio:</strong> ${tracking}</p>` : ""}
                    ${labelLinkHtml}
                    <h3>Endereço de entrega</h3><p>${addrHtml}</p>`
                }
              });
            } catch (e) { console.error("Erro email etiqueta vendedor:", e); }

            // E-mail para o cliente com rastreio
            if (tracking && customerEmail) {
              try {
                await supabase.functions.invoke("send-email", {
                  body: {
                    from: DEFAULT_FROM,
                    reply_to: SELLER_EMAIL,
                    to: customerEmail,
                    subject: `Seu pedido ${updatedOrder.reference_id} foi postado`,
                    html: `<h1>Pedido a caminho!</h1>
                      <p>Olá ${customerName}, seu pedido foi postado.</p>
                      <p>Código de rastreio: <strong>${tracking}</strong></p>
                      <p>Equipe Still Informatica</p>`
                  }
                });
              } catch (e) { console.error("Erro email rastreio cliente:", e); }
            }
          }
        } catch (e) { console.error("Erro etiqueta:", e); }
      }
    } else {
      console.warn("Could not determine reference_id and status from notification");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in webhook handler:", error);
    return new Response(JSON.stringify({ error: "Falha ao verificar pagamento" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
