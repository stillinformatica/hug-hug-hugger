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
    console.log("PagBank notification received. Headers:", Object.fromEntries(req.headers.entries()));
    console.log("Body:", bodyText);

    let notificationData: any = null;
    let referenceId: string | null = null;
    let status: string | null = null;
    let pagbankId: string | null = null;

    // Try to parse as JSON first (v4 Orders API)
    try {
      notificationData = JSON.parse(bodyText);
      console.log("Parsed as JSON (v4)");

      // PagBank v4 Orders API webhook structure
      if (notificationData.reference_id) {
        referenceId = notificationData.reference_id;
        pagbankId = notificationData.id;
        
        // Find status from charges
        if (notificationData.charges && notificationData.charges.length > 0) {
          status = notificationData.charges[0].status;
        } else if (notificationData.status) {
          status = notificationData.status;
        }
      }
    } catch (e) {
      // Not JSON, check if it's form-encoded (v2/v3)
      console.log("Not JSON, checking form-encoded...");
      const params = new URLSearchParams(bodyText);
      const notificationCode = params.get("notificationCode");
      const notificationType = params.get("notificationType");

      if (notificationCode && notificationType === "transaction") {
        console.log("v3 Transaction notification detected. Fetching details...");
        
        const response = await fetch(
          `${PAGBANK_PROD_WS}/v3/transactions/notifications/${notificationCode}?email=${Deno.env.get("PAGBANK_EMAIL")}&token=${PAGBANK_TOKEN}`,
          { method: "GET" }
        );

        if (response.ok) {
          const xmlText = await response.text();
          console.log("v3 details received (XML):", xmlText);
          
          // Basic XML extraction (could use a library, but regex is faster for simple cases)
          const refMatch = xmlText.match(/<reference>(.*?)<\/reference>/);
          const statusMatch = xmlText.match(/<status>(.*?)<\/status>/);
          const codeMatch = xmlText.match(/<code>(.*?)<\/code>/);

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
      
      const { data: updatedOrder, error } = await supabase
        .from("orders")
        .update({
          status: status,
          pagbank_id: pagbankId,
          notification_data: notificationData || bodyText,
          updated_at: new Date().toISOString(),
        })
        .eq("reference_id", referenceId)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Error updating order in database:", error);
      } else {
        console.log("Order updated successfully");
      }

      // Disparar confirmação quando o pagamento for aprovado pelo PagBank.
      if (updatedOrder && paymentConfirmedStatuses.has(status)) {
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

          if (shipData?.success && shipData?.tracking) {
            await supabase.functions.invoke("send-email", {
              body: {
                from: DEFAULT_FROM,
                reply_to: SELLER_EMAIL,
                to: updatedOrder.customer_email,
                subject: `Seu pedido ${updatedOrder.reference_id} foi postado`,
                html: `<h1>Pedido a caminho!</h1>
                  <p>Código de rastreio: <strong>${shipData.tracking}</strong></p>
                  <p>Equipe Still Informatica</p>`
              }
            });
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
