import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCartStore } from "@/stores/cartStore";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Truck,
  CreditCard,
  ShoppingCart,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
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

type PaymentResult = {
  status: "approved" | "pending" | "rejected" | "in_process";
  reference_id: string;
  qr_code?: string;
  qr_code_base64?: string;
  ticket_url?: string;
  boleto_url?: string;
};

const BRICK_INIT_FAILURE_MESSAGE = "O formulário do Mercado Pago não foi liberado para esta aplicação ou domínio. Você pode continuar pelo checkout seguro do Mercado Pago enquanto ajusta a configuração da aplicação.";

const normalizeMpErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeMessage = [
      (error as { message?: string }).message,
      (error as { error?: string }).error,
      (error as { cause?: { message?: string } }).cause?.message,
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    if (maybeMessage) return maybeMessage;

    try {
      return JSON.stringify(error);
    } catch {
      return "Erro desconhecido ao carregar o pagamento";
    }
  }

  return "Erro desconhecido ao carregar o pagamento";
};

const getBrickErrorMessage = (error: unknown) => {
  const message = normalizeMpErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("bricks component initialization failed") ||
    lowerMessage.includes("payment_methods/search") ||
    lowerMessage.includes("404") ||
    lowerMessage.includes("403")
  ) {
    if (lowerMessage.includes("404") || lowerMessage.includes("payment_methods")) {
      return "Erro de credenciais no Mercado Pago (404). Por favor, verifique se o Public Key está correto e se a conta está ativa.";
    }
    return BRICK_INIT_FAILURE_MESSAGE;
  }

  return message;
};

const SDK_URL = "https://sdk.mercadopago.com/js/v2";
const SDK_LOAD_TIMEOUT_MS = 15000;
const BRICK_LOAD_TIMEOUT_MS = 20000;

const loadMpSdk = (() => {
  let promise: Promise<void> | null = null;

  const waitForMercadoPago = (timeoutMs: number) => new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if ((window as any).MercadoPago) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("O formulário de pagamento demorou para carregar"));
        return;
      }

      window.setTimeout(check, 100);
    };

    check();
  });

  return () => {
    if (promise) return promise;

    promise = new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("window indisponível"));
        return;
      }

      if ((window as any).MercadoPago) {
        resolve();
        return;
      }

      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);

      const finish = () => {
        waitForMercadoPago(SDK_LOAD_TIMEOUT_MS).then(resolve).catch(reject);
      };

      if (existing) {
        if (existing.dataset.loaded === "true") {
          finish();
          return;
        }

        existing.addEventListener("load", () => {
          existing.dataset.loaded = "true";
          finish();
        }, { once: true });
        existing.addEventListener("error", () => reject(new Error("Falha ao carregar SDK Mercado Pago")), { once: true });
        window.setTimeout(finish, 300);
        return;
      }

      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        finish();
      };
      script.onerror = () => reject(new Error("Falha ao carregar SDK Mercado Pago"));
      document.head.appendChild(script);
    }).catch((error) => {
      promise = null;
      throw error;
    });

    return promise;
  };
})();

const Checkout = () => {
  const { items, clearCart } = useCartStore();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [cep, setCep] = useState("");
  const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");

  const [showBrick, setShowBrick] = useState(false);
  const [brickLoading, setBrickLoading] = useState(false);
  const [brickError, setBrickError] = useState<string | null>(null);
  const [redirectCheckoutLoading, setRedirectCheckoutLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);

  const brickControllerRef = useRef<any>(null);
  const checkoutDataRef = useRef<any>(null);

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
    setShippingError(null);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-shipping", {
        body: {
          postal_code: cep,
          items: items.map((i) => ({ 
            name: i.name, 
            quantity: i.quantity,
            price: i.price,
            weight: (i as any).weight,
            width: (i as any).width,
            height: (i as any).height,
            length: (i as any).length,
          })),
        },
      });

      if (error) throw error;

      setAddressInfo(data.address);
      setShippingOptions(data.shipping_options);
      setSelectedShipping(data.shipping_options[0]?.id || null);

      // Se houver uma mensagem de erro vinda da Total Express (capturada no raw_result ou logs)
      // Como a função retorna shippingOptions mesmo em erro (fallback), vamos verificar o conteúdo
      if (data.shipping_options.length === 1 && data.shipping_options[0].id === "standard_shipping") {
        // Buscamos detalhes do erro se disponíveis
        console.warn("Utilizando frete de fallback.");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      setShippingError(`Erro ao calcular frete na Total Express: ${errorMessage}. O IP do servidor pode estar bloqueado.`);
      toast.error("Erro ao calcular frete", { description: "Verifique o CEP e tente novamente" });
    } finally {
      setIsLoadingShipping(false);
    }
  };

  // Mantém os dados atualizados em ref para o callback do Brick
  useEffect(() => {
    checkoutDataRef.current = {
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone.replace(/\D/g, ""),
      },
      shipping: addressInfo
        ? {
            street: addressInfo.street,
            number: addressNumber,
            complement: addressComplement,
            locality: addressInfo.neighborhood,
            city: addressInfo.city,
            region_code: addressInfo.state,
            postal_code: cep.replace(/\D/g, ""),
          }
        : null,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_amount: item.price,
        reference_id: item.productId,
      })),
      totalAmount: totalPrice,
    };
  }, [customerName, customerEmail, customerPhone, addressInfo, addressNumber, addressComplement, cep, items, totalPrice]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentStatus = params.get("payment");
    const referenceId = params.get("ref") || params.get("external_reference") || "";

    if (!paymentStatus) return;

    if (paymentStatus === "success") {
      setPaymentResult({ status: "approved", reference_id: referenceId || "pedido" });
      clearCart();
      return;
    }

    if (paymentStatus === "pending") {
      setPaymentResult({ status: "pending", reference_id: referenceId || "pedido" });
      return;
    }

    if (paymentStatus === "failure") {
      setPaymentResult({ status: "rejected", reference_id: referenceId || "pedido" });
    }
  }, [location.search, clearCart]);

  const startPayment = () => {
    if (paymentRequirementsMessage) {
      toast.error("Dados incompletos", { description: paymentRequirementsMessage });
      return;
    }
    setBrickError(null);
    setShowBrick(true);
  };

  const handleRedirectCheckout = async () => {
    if (paymentRequirementsMessage) {
      toast.error("Dados incompletos", { description: paymentRequirementsMessage });
      return;
    }

    const ctx = checkoutDataRef.current;
    setRedirectCheckoutLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-create-preference", {
        body: {
          items: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit_amount: item.price,
            reference_id: item.productId,
            image: item.image,
          })),
          customer: ctx.customer,
          shipping: ctx.shipping,
          shippingCost: shippingPrice,
        },
      });

      if (error) throw error;

      const paymentUrl = data?.sandbox_init_point || data?.init_point || data?.payment_url;
      if (!paymentUrl) {
        throw new Error("Não foi possível gerar o checkout do Mercado Pago.");
      }

      window.location.href = paymentUrl;
    } catch (err) {
      console.error(err);
      toast.error("Erro ao abrir checkout do Mercado Pago", {
        description: err instanceof Error ? err.message : "Tente novamente em instantes",
      });
    } finally {
      setRedirectCheckoutLoading(false);
    }
  };

  // Inicializa o Payment Brick quando o usuário clica em "Pagar"
  useEffect(() => {
    if (!showBrick) return;
    let cancelled = false;

    const init = async () => {
      setBrickLoading(true);
      try {
        // Validações que travam o Brick silenciosamente
        if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
          throw new Error("E-mail inválido. Volte e preencha um e-mail válido.");
        }
        if (!totalPrice || totalPrice <= 0) {
          throw new Error("Valor do pedido inválido.");
        }

        console.log("[MP Brick] Iniciando. amount=", totalPrice, "email=", customerEmail);
        await loadMpSdk();
        console.log("[MP Brick] SDK carregado");

        const { data: keyData, error: keyErr } = await supabase.functions.invoke("mercadopago-public-key");
        if (keyErr) throw keyErr;
        const publicKey = keyData?.public_key;
        if (!publicKey) throw new Error("Chave pública do Mercado Pago não configurada");
        
        // Verifica se a chave pública parece ser um token de acesso (erro comum)
        if (publicKey.length > 60 && publicKey.startsWith("APP_USR-")) {
          console.error("[MP Brick] A chave pública parece ser um Token de Acesso. Verifique as configurações.");
          throw new Error("A chave pública configurada parece ser um Token de Acesso. Por favor, verifique se você não inverteu o Public Key e o Access Token nas configurações.");
        }
        
        console.log("[MP Brick] Public key OK");

        if (cancelled) return;

        // Aguarda o container existir no DOM (React pode não ter commitado ainda)
        let container: HTMLElement | null = null;
        for (let i = 0; i < 50; i++) {
          container = document.getElementById("mp-payment-brick");
          if (container) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!container) throw new Error("Container do pagamento não encontrado");
        container.innerHTML = "";
        console.log("[MP Brick] Container pronto");

        const mp = new (window as any).MercadoPago(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mp.bricks();

        let readyResolved = false;
        // Fallback: se onReady não disparar em 4s mas o container já tem conteúdo, esconde o loader
        const readyFallback = window.setTimeout(() => {
          if (!readyResolved && container && container.children.length > 0) {
            readyResolved = true;
            setBrickLoading(false);
          }
        }, 4000);
        const controller = await Promise.race([
          bricksBuilder.create("payment", "mp-payment-brick", {
            initialization: {
              amount: Number(totalPrice.toFixed(2)),
              payer: { email: customerEmail },
            },
            customization: {
              paymentMethods: {
                creditCard: "all",
                debitCard: "all",
                bankTransfer: "all",
                ticket: "all",
                maxInstallments: 12,
              },
              visual: { style: { theme: "default" } },
            },
            callbacks: {
              onReady: () => {
                readyResolved = true;
                window.clearTimeout(readyFallback);
                setBrickLoading(false);
              },
              onSubmit: async ({ formData }: { formData: any }) => {
                const ctx = checkoutDataRef.current;
                try {
                  const { data, error } = await supabase.functions.invoke("mercadopago-process-payment", {
                    body: {
                      formData,
                      items: ctx.items,
                      customer: ctx.customer,
                      shipping: ctx.shipping,
                      totalAmount: ctx.totalAmount,
                    },
                  });
                  if (error) throw error;
                  if (data?.error) throw new Error(data.error);

                  const status = data.status as PaymentResult["status"];
                  setPaymentResult({
                    status,
                    reference_id: data.reference_id,
                    qr_code: data.qr_code,
                    qr_code_base64: data.qr_code_base64,
                    ticket_url: data.ticket_url,
                    boleto_url: data.boleto_url,
                  });
                  if (status === "approved") {
                    clearCart();
                    toast.success("Pagamento aprovado!");
                  } else if (status === "pending" || status === "in_process") {
                    toast.info("Pagamento em processamento");
                  } else {
                    toast.error("Pagamento não aprovado");
                  }
                } catch (err) {
                  console.error(err);
                  toast.error("Erro ao processar pagamento", {
                    description: err instanceof Error ? err.message : "Tente novamente",
                  });
                  throw err;
                }
              },
              onError: (error: any) => {
                console.error("Brick error:", error);
                setBrickLoading(false);
                setBrickError(getBrickErrorMessage(error));
              },
            },
          }),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => {
              if (!readyResolved) {
                reject(new Error(BRICK_INIT_FAILURE_MESSAGE));
              }
            }, BRICK_LOAD_TIMEOUT_MS);
          }),
        ]);

        brickControllerRef.current = controller;
        window.setTimeout(() => {
          if (!cancelled) setBrickLoading(false);
        }, 1500);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setBrickError(getBrickErrorMessage(err));
          setBrickLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        brickControllerRef.current?.unmount?.();
      } catch (_) { /* noop */ }
      brickControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBrick]);

  // Tela de resultado do pagamento (sem redirect — direto na página)
  if (paymentResult) {
    const isSuccess = paymentResult.status === "approved";
    const isPending = paymentResult.status === "pending" || paymentResult.status === "in_process";
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StoreHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isSuccess ? (
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                ) : isPending ? (
                  <Clock className="h-6 w-6 text-primary" />
                ) : (
                  <XCircle className="h-6 w-6 text-destructive" />
                )}
                {isSuccess
                  ? "Pagamento Aprovado!"
                  : isPending
                    ? "Pagamento Pendente"
                    : "Pagamento não concluído"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isSuccess && (
                <p className="text-muted-foreground">
                  Recebemos seu pagamento (pedido {paymentResult.reference_id}). Em breve você receberá um e-mail com os detalhes do envio.
                </p>
              )}
              {isPending && paymentResult.qr_code_base64 && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">Escaneie o QR Code para pagar com PIX:</p>
                  <img
                    src={`data:image/png;base64,${paymentResult.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="mx-auto w-64 h-64 border rounded-xl"
                  />
                  {paymentResult.qr_code && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Ou copie o código:</p>
                      <code className="block p-2 bg-secondary rounded text-xs break-all">
                        {paymentResult.qr_code}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(paymentResult.qr_code!);
                          toast.success("Código copiado");
                        }}
                      >
                        Copiar código PIX
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {isPending && paymentResult.boleto_url && (
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">Boleto gerado com sucesso.</p>
                  <a href={paymentResult.boleto_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline">Abrir boleto</Button>
                  </a>
                </div>
              )}
              {isPending && !paymentResult.qr_code_base64 && !paymentResult.boleto_url && (
                <p className="text-muted-foreground">
                  Seu pagamento está sendo processado. Assim que for confirmado, enviaremos um e-mail.
                </p>
              )}
              {!isSuccess && !isPending && (
                <p className="text-muted-foreground">
                  O pagamento não foi concluído. Você pode tentar novamente.
                </p>
              )}
              <div className="flex gap-2">
                <Link to="/" className="flex-1">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar à loja
                  </Button>
                </Link>
                {!isSuccess && !isPending && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setPaymentResult(null);
                      setShowBrick(true);
                    }}
                  >
                    Tentar novamente
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
        <StoreFooter />
      </div>
    );
  }

  if (items.length === 0) {
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

                  {shippingError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                      <p className="font-medium flex items-center gap-2">
                        <XCircle className="h-4 w-4" /> Erro na Integração Total Express
                      </p>
                      <p className="mt-1 opacity-90">{shippingError}</p>
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

            {showBrick && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Pagamento Seguro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {brickLoading && !brickError && (
                      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Carregando formulário de pagamento...
                      </div>
                    )}
                    {brickError && (
                      <div className="text-center py-6 space-y-3">
                        <p className="text-destructive text-sm whitespace-pre-wrap break-words">{brickError}</p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setBrickError(null);
                              setBrickLoading(false);
                              setShowBrick(false);
                              setTimeout(() => setShowBrick(true), 50);
                            }}
                          >
                            Recarregar
                          </Button>
                          <Button
                            onClick={handleRedirectCheckout}
                            disabled={redirectCheckoutLoading}
                          >
                            {redirectCheckoutLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Abrir checkout do Mercado Pago
                          </Button>
                        </div>
                      </div>
                    )}
                    <div id="mp-payment-brick" />
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

                {!showBrick && (
                  <div className="space-y-2">
                    <Button
                      onClick={startPayment}
                      size="lg"
                      className="w-full rounded-xl"
                      disabled={!!paymentRequirementsMessage}
                    >
                      <CreditCard className="h-5 w-5 mr-2" /> Ir para Pagamento
                    </Button>
                    <p className="text-xs text-center min-h-4 text-muted-foreground">
                      {paymentRequirementsMessage ?? "Pagamento direto no site. Aceita Pix, cartão de crédito, débito e boleto."}
                    </p>
                  </div>
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
