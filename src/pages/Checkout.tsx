import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCartStore } from "@/stores/cartStore";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, MapPin, Truck, CreditCard, ShoppingCart, Package, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

interface ShippingOption {
  id: string;
  name: string;
  price: number;
  estimated_days: number;
  description: string;
}

interface AddressInfo {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface PaymentResult {
  id: string | number;
  status: string;
  status_detail?: string;
  qr_code?: string;
  qr_code_base64?: string;
  ticket_url?: string;
  boleto_url?: string;
}

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

const Checkout = () => {
  const { items, clearCart } = useCartStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [cep, setCep] = useState("");
  const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");

  const [showPayment, setShowPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickControllerRef = useRef<any>(null);
  const mpInstanceRef = useRef<any>(null);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingPrice = shippingOptions.find((o) => o.id === selectedShipping)?.price || 0;
  const totalPrice = subtotal + shippingPrice;
  const paymentRequirementsMessage = !customerName || !customerEmail
    ? "Preencha nome e e-mail para continuar"
    : !addressInfo
      ? "Busque seu CEP para calcular o frete"
      : !addressNumber
        ? "Informe o número do endereço"
        : !selectedShipping
          ? "Escolha uma opção de envio"
          : null;

  const handleCepSearch = async () => {
    if (cep.replace(/\D/g, "").length !== 8) {
      toast.error("CEP inválido", { description: "Digite um CEP com 8 dígitos" });
      return;
    }

    setIsLoadingShipping(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-shipping", {
        body: {
          postal_code: cep,
          items: items.map((i) => ({ name: i.name, quantity: i.quantity })),
        },
      });

      if (error) throw error;

      setAddressInfo(data.address);
      setShippingOptions(data.shipping_options);
      setSelectedShipping(data.shipping_options[0]?.id || null);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao calcular frete", { description: "Verifique o CEP e tente novamente" });
    } finally {
      setIsLoadingShipping(false);
    }
  };

  const loadMercadoPagoSdk = async (): Promise<any> => {
    if (window.MercadoPago && mpInstanceRef.current) return mpInstanceRef.current;

    if (!window.MercadoPago) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[src="https://sdk.mercadopago.com/js/v2"]');
        if (existing) {
          if (window.MercadoPago) return resolve();
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("Falha ao carregar SDK MP")));
          return;
        }
        const script = document.createElement("script");
        script.src = "https://sdk.mercadopago.com/js/v2";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Falha ao carregar SDK MP"));
        document.body.appendChild(script);
      });
    }

    const { data, error } = await supabase.functions.invoke("mercadopago-public-key");
    console.log("MP public-key response:", { data, error });
    if (error) throw new Error(`Erro ao buscar public key: ${error.message}`);
    if (!data?.public_key) throw new Error("MERCADOPAGO_PUBLIC_KEY não configurada no servidor");

    mpInstanceRef.current = new window.MercadoPago(data.public_key, { locale: "pt-BR" });
    return mpInstanceRef.current;
  };

  const goToPayment = async () => {
    if (!customerName || !customerEmail) {
      toast.error("Preencha seus dados", { description: "Nome e e-mail são obrigatórios" });
      return;
    }
    if (!addressInfo || !selectedShipping || !addressNumber) {
      toast.error("Endereço incompleto", { description: "Calcule o frete e informe o número" });
      return;
    }
    setShowPayment(true);
    // Scroll para o brick após renderizar
    setTimeout(() => {
      brickContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  };

  // Renderiza o Payment Brick quando showPayment fica true
  useEffect(() => {
    if (!showPayment || paymentResult) return;
    let cancelled = false;

    (async () => {
      try {
        const mp = await loadMercadoPagoSdk();
        if (cancelled) return;

        // Aguarda o container existir no DOM
        let attempts = 0;
        while (!document.getElementById("mp-payment-brick") && attempts < 20) {
          await new Promise((r) => setTimeout(r, 50));
          attempts++;
        }
        if (cancelled) return;
        if (!document.getElementById("mp-payment-brick")) {
          throw new Error("Container do pagamento não encontrado");
        }

        if (brickControllerRef.current) {
          try { brickControllerRef.current.unmount(); } catch { /* noop */ }
          brickControllerRef.current = null;
        }

        const bricksBuilder = mp.bricks();
        brickControllerRef.current = await bricksBuilder.create("payment", "mp-payment-brick", {
          initialization: {
            amount: totalPrice,
            payer: { email: customerEmail },
          },
          customization: {
            paymentMethods: {
              creditCard: "all",
              debitCard: "all",
              ticket: "all",
              bankTransfer: "all", // Pix
              maxInstallments: 12,
            },
            visual: { style: { theme: "default" } },
          },
          callbacks: {
            onReady: () => console.log("MP Brick pronto"),
            onSubmit: async ({ formData }: any) => {
              setIsProcessingPayment(true);
              try {
                const { data, error } = await supabase.functions.invoke("mercadopago-process-payment", {
                  body: {
                    formData,
                    items: items.map((item) => ({
                      name: item.name,
                      quantity: item.quantity,
                      unit_amount: item.price,
                      reference_id: item.productId,
                    })),
                    customer: {
                      name: customerName,
                      email: customerEmail,
                      phone: customerPhone.replace(/\D/g, ""),
                    },
                    shipping: {
                      street: addressInfo.street,
                      number: addressNumber,
                      complement: addressComplement,
                      locality: addressInfo.neighborhood,
                      city: addressInfo.city,
                      region_code: addressInfo.state,
                      postal_code: cep.replace(/\D/g, ""),
                    },
                    totalAmount: totalPrice,
                  },
                });

                if (error) throw error;

                setPaymentResult(data);
                if (data.status === "approved") {
                  toast.success("Pagamento aprovado!");
                  clearCart();
                } else if (data.status === "pending" || data.status === "in_process") {
                  toast.info("Aguardando confirmação do pagamento");
                  if (data.qr_code || data.boleto_url) clearCart();
                } else {
                  toast.error("Pagamento recusado", { description: data.status_detail || "Tente outro método" });
                }
              } catch (err) {
                console.error(err);
                toast.error("Erro ao processar pagamento");
              } finally {
                setIsProcessingPayment(false);
              }
            },
            onError: (err: any) => {
              console.error("MP Brick error:", err);
              toast.error("Erro no formulário de pagamento");
            },
          },
        });
      } catch (err) {
        console.error("Erro ao carregar Payment Brick:", err);
        toast.error("Não foi possível carregar o pagamento", {
          description: err instanceof Error ? err.message : "Tente novamente",
        });
        setShowPayment(false);
      }
    })();

    return () => {
      cancelled = true;
      if (brickControllerRef.current) {
        try { brickControllerRef.current.unmount(); } catch { /* noop */ }
        brickControllerRef.current = null;
      }
    };
  }, [showPayment, paymentResult, totalPrice, customerEmail]);

  if (items.length === 0 && !paymentResult) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StoreHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <ShoppingCart className="h-16 w-16 text-muted-foreground opacity-30" />
          <p className="text-xl text-muted-foreground">Seu carrinho está vazio</p>
          <Link to="/">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Continuar comprando</Button>
          </Link>
        </div>
        <StoreFooter />
      </div>
    );
  }

  // Tela de resultado (PIX / Boleto / Aprovado)
  if (paymentResult) {
    const isApproved = paymentResult.status === "approved";
    const isPix = !!paymentResult.qr_code;
    const isBoleto = !!paymentResult.boleto_url;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StoreHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isApproved ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Package className="h-6 w-6 text-primary" />}
                {isApproved ? "Pagamento Aprovado!" : isPix ? "Pague com Pix" : isBoleto ? "Boleto Gerado" : "Pagamento em processamento"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPix && paymentResult.qr_code_base64 && (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={`data:image/png;base64,${paymentResult.qr_code_base64}`}
                    alt="QR Code Pix"
                    className="w-64 h-64"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(paymentResult.qr_code!);
                      toast.success("Código Pix copiado!");
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copiar código Pix
                  </Button>
                  <p className="text-xs text-muted-foreground text-center break-all max-w-md">
                    {paymentResult.qr_code}
                  </p>
                </div>
              )}
              {isBoleto && (
                <Button asChild className="w-full">
                  <a href={paymentResult.boleto_url} target="_blank" rel="noreferrer">Abrir Boleto</a>
                </Button>
              )}
              {isApproved && (
                <p className="text-muted-foreground">Recebemos seu pagamento. Em breve você receberá um e-mail com os detalhes.</p>
              )}
              <Link to="/">
                <Button variant="outline" className="w-full"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar à loja</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
        <StoreFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StoreHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Continuar comprando
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">Finalizar Compra</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Seus Dados
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome completo *</Label>
                      <Input id="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Seu nome" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail *</Label>
                      <Input id="email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="seu@email.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(11) 99999-9999" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5 text-primary" />
                    Endereço de Entrega
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="Digite seu CEP" maxLength={9} className="max-w-[200px]" />
                    <Button onClick={handleCepSearch} disabled={isLoadingShipping} variant="outline">
                      {isLoadingShipping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>

                  {addressInfo && (
                    <div className="space-y-4">
                      <div className="p-3 bg-secondary/50 rounded-xl text-sm">
                        <p className="font-medium text-foreground">{addressInfo.street}</p>
                        <p className="text-muted-foreground">{addressInfo.neighborhood} - {addressInfo.city}/{addressInfo.state}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="number">Número *</Label>
                          <Input id="number" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="123" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="complement">Complemento</Label>
                          <Input id="complement" value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Apto, bloco..." />
                        </div>
                      </div>
                    </div>
                  )}

                  {shippingOptions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Truck className="h-4 w-4" /> Opções de Envio</Label>
                      {shippingOptions.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setSelectedShipping(option.id)}
                          className={`w-full p-3 rounded-xl border text-left transition-colors ${
                            selectedShipping === option.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-foreground text-sm">{option.name}</p>
                              <p className="text-xs text-muted-foreground">{option.estimated_days} dias úteis</p>
                            </div>
                            <span className="font-bold text-primary text-sm">
                              {option.price === 0 ? "GRÁTIS" : `R$ ${option.price.toFixed(2)}`}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {showPayment && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Pagamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div id="mp-payment-brick" ref={brickContainerRef} />
                    {isProcessingPayment && (
                      <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Processando pagamento...
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-primary" />
                  Resumo do Pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item) => (
                  <div key={item.productId} className="flex gap-3">
                    <div className="w-12 h-12 bg-secondary rounded-lg overflow-hidden flex-shrink-0">
                      {item.image && (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Qtd: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-bold text-foreground">R$ {(item.price * item.quantity).toFixed(2).replace(".", ",")}</p>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frete</span>
                    <span className="text-foreground">
                      {shippingPrice === 0 ? "GRÁTIS" : `R$ ${shippingPrice.toFixed(2).replace(".", ",")}`}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
                </div>

                {!showPayment && (
                  <div className="space-y-2">
                    <Button
                      onClick={goToPayment}
                      size="lg"
                      className="w-full rounded-xl"
                    >
                      <CreditCard className="h-5 w-5 mr-2" />
                      Ir para Pagamento
                    </Button>

                    <p className="text-xs text-center min-h-4 text-muted-foreground">
                      {paymentRequirementsMessage ?? "Pagamento seguro via Mercado Pago. Aceita Pix, cartão de crédito, débito e boleto."}
                    </p>
                  </div>
                )}

                {showPayment && (
                  <p className="text-xs text-muted-foreground text-center">
                    Pagamento seguro via Mercado Pago. Aceita Pix, cartão de crédito, débito e boleto.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <StoreFooter />
    </div>
  );
};

export default Checkout;
