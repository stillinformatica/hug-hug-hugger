import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Search, Package, CheckCircle2, Truck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Order {
  id: string;
  reference_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  created_at: string;
  tracking_number?: string;
}

const OrdersManager = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast.error("Erro ao carregar pedidos");
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleUpdateStatus = async (orderId: string, currentStatus: string, email: string, name: string, ref: string) => {
    let nextStatus = "";
    let subject = "";
    let html = "";

    if (currentStatus === "PAID") {
      nextStatus = "SHIPPED";
      subject = `Seu pedido #${ref} foi enviado! - Still Informatica`;
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h1 style="color: #007bff;">Ótimas notícias, ${name}!</h1>
          <p>Seu pedido <strong>${ref}</strong> já foi postado e está a caminho.</p>
          <p>Você poderá acompanhar o rastreamento em breve através do nosso site ou do site da transportadora.</p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Status:</strong> Enviado</p>
          </div>
          <p>Agradecemos a preferência!</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Still Informatica - Soluções em Tecnologia</p>
        </div>
      `;
    } else {
      return; // Outros status não implementados para transição manual simples aqui
    }

    setUpdatingId(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", orderId);

      if (error) throw error;

      // Enviar e-mail de notificação
      await supabase.functions.invoke("send-email", {
        body: {
          to: email,
          subject,
          html,
          from: "Still Informatica <contato@stillinformatica.com.br>"
        }
      });

      toast.success("Status atualizado e e-mail enviado!");
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar pedido");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter(o => 
    o.reference_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID": return <Badge className="bg-green-500">Pago</Badge>;
      case "SHIPPED": return <Badge className="bg-blue-500">Enviado</Badge>;
      case "CREATED": return <Badge variant="outline">Aguardando</Badge>;
      case "CANCELLED": return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gerenciar Pedidos</CardTitle>
            <CardDescription>Acompanhe vendas e atualize o status de envio</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar pedidos..." 
              className="pl-8" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filteredOrders.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum pedido encontrado.</p>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map(order => (
              <div key={order.id} className="p-4 border border-border rounded-xl bg-secondary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">#{order.reference_id}</span>
                    {getStatusBadge(order.status)}
                  </div>
                  <p className="text-sm font-medium">{order.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{order.customer_email}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">R$ {order.total_amount.toFixed(2).replace(".", ",")}</p>
                  </div>
                  
                  {order.status === "PAID" && (
                    <Button 
                      size="sm" 
                      onClick={() => handleUpdateStatus(order.id, order.status, order.customer_email, order.customer_name, order.reference_id)}
                      disabled={updatingId === order.id}
                      className="gap-2"
                    >
                      {updatingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                      Marcar como Enviado
                    </Button>
                  )}
                  
                  {order.status === "SHIPPED" && (
                    <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                      <CheckCircle2 className="h-3 w-3" /> E-mail enviado
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrdersManager;