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
  Calendar,
  Lock,
  QrCode,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

declare global {
  interface Window {
    PagSeguro?: any;
  }
}

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
};

const Checkout = () => {
  const { items, clearCart } = useCartStore();
  const location = useLocation();

  const [cep, setCep] = useState("");
  const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<"REDIRECT">("REDIRECT");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [installments, setInstallments] = useState("1");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ text: string; qrCode: string } | null>(null);

  const [pagBankLoading, setPagBankLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);

  const checkoutDataRef = useRef<any>(null);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingPrice = shippingOptions.find((o) => o.id === selectedShipping)?.price || 0;
  const totalPrice = subtotal + shippingPrice;

  const paymentRequirementsMessage = !customerName.trim().includes(" ") || !customerEmail || !customerCpf
    ? "Informe seu nome completo (nome e sobrenome), e-mail e CPF para continuar"
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

      setAddressInfo(data.address || { street: "", neighborhood: "", city: "", state: "" });
      setShippingOptions(data.shipping_options || []);
      setSelectedShipping(data.shipping_options?.[0]?.id || null);

      if (data.shipping_options.length === 1 && data.shipping_options[0].id === "standard_shipping") {
        setShippingError("A Total Express retornou 'Acesso Negado!'. O suporte da transportadora precisa liberar o acesso.");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      setShippingError(`Erro ao calcular frete: ${errorMessage}.`);
      toast.error("Erro ao calcular frete", { description: "Verifique o CEP e tente novamente" });
    } finally {
      setIsLoadingShipping(false);
    }
  };

  const updateAddressInfo = (field: keyof AddressInfo, value: string) => {
    setAddressInfo((prev) => prev ? { ...prev, [field]: value } : { street: "", neighborhood: "", city: "", state: "", [field]: value });
  };

  useEffect(() => {
    checkoutDataRef.current = {
      customer: {
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.replace(/\D/g, ""),
        cpf: customerCpf.replace(/\D/g, ""),
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
            cpf: customerCpf.replace(/\D/g, ""),
            phone: customerPhone.replace(/\D/g, ""),
            shipping_service_id: selectedShipping,
          }
        : null,
      items: items.map((item) => ({
        name: item.name,
        description: item.description || item.name,
        quantity: item.quantity,
        unit_amount: item.price,
        reference_id: item.productId,
      })),
      totalAmount: totalPrice,
    };
  }, [customerName, customerEmail, customerPhone, customerCpf, addressInfo, addressNumber, addressComplement, cep, items, totalPrice]);

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("pagbank-public-key", {
          body: { type: "card" }
        });
        if (error) throw error;
        setPublicKey(data.public_key);
      } catch (err) {
        console.error("Erro ao buscar chave pública:", err);
      }
    };
    fetchPublicKey();
  }, []);

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

  const handlePagBankCheckout = async () => {
    if (paymentRequirementsMessage) {
      toast.error("Dados incompletos", { description: paymentRequirementsMessage });
      return;
    }

    setPagBankLoading(true);

    try {
      const ctx = checkoutDataRef.current;

      const { data, error } = await supabase.functions.invoke("pagbank-checkout", {
        body: {
          items: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit_amount: item.price,
            productId: item.productId,
          })),
          customer: ctx.customer,
          shipping: ctx.shipping,
        },
      });

      if (error) throw error;

      if (data.payment_url) {
        // Redireciona o usuário para o PagBank
        window.location.href = data.payment_url;
      } else {
        throw new Error("Link de pagamento não gerado pelo PagBank");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro no checkout", {
        description: err instanceof Error ? err.message : "Tente novamente",
      });
    } finally {
      setPagBankLoading(false);
    }
  };

  const copyPixCode = () => {
    if (pixData) {
      navigator.clipboard.writeText(pixData.text);
      toast.success("Código PIX copiado!");
    }
  };

  if (paymentResult || pixData) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StoreHeader searchQuery="" onSearchChange={() => {}} />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              {pixData ? (
                <>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                    <QrCode className="h-10 w-10" />
                  </div>
                  <h2 className="text-2xl font-bold">Pague com PIX</h2>
                  <p className="text-muted-foreground text-sm">Escaneie o QR Code abaixo ou copie o código para pagar.</p>
                  
                  {pixData.qrCode && (
                    <div className="bg-white p-2 rounded-xl border max-w-[200px] mx-auto">
                      <img src={pixData.qrCode} alt="QR Code PIX" className="w-full h-auto" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Código PIX (Copia e Cola)</Label>
                    <div className="flex gap-2">
                      <Input value={pixData.text} readOnly className="bg-secondary/30 text-xs" />
                      <Button size="icon" variant="outline" onClick={copyPixCode}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground bg-secondary/20 p-3 rounded-lg">
                    Após o pagamento, seu pedido será processado automaticamente. Pode levar alguns minutos.
                  </p>
                </>
              ) : paymentResult?.status === "approved" ? (
                <>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h2 className="text-2xl font-bold">Pagamento Aprovado!</h2>
                  <p className="text-muted-foreground">Obrigado pela sua compra. Seu pedido #{paymentResult.reference_id} está sendo processado.</p>
                </>
              ) : paymentResult?.status === "pending" ? (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
                    <Clock className="h-10 w-10" />
                  </div>
                  <h2 className="text-2xl font-bold">Pagamento em Processamento</h2>
                  <p className="text-muted-foreground">Estamos aguardando a confirmação do seu pagamento.</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                    <XCircle className="h-10 w-10" />
                  </div>
                  <h2 className="text-2xl font-bold">Falha no Pagamento</h2>
                  <p className="text-muted-foreground">Houve um problema ao processar seu pagamento. Tente novamente.</p>
                </>
              )}
              <Button asChild className="w-full rounded-xl" onClick={() => { if(pixData) clearCart(); }}>
                <Link to="/">Voltar para a loja</Link>
              </Button>
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
        <StoreHeader searchQuery="" onSearchChange={() => {}} />
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <ShoppingCart className="h-16 w-16 text-muted-foreground opacity-20" />
          <h2 className="text-xl font-semibold">Seu carrinho está vazio</h2>
          <Button asChild className="rounded-xl">
            <Link to="/">Ver produtos</Link>
          </Button>
        </main>
        <StoreFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StoreHeader searchQuery="" onSearchChange={() => {}} />

      <main className="flex-1 max-w-[1600px] mx-auto px-4 py-8 w-full">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input 
                        id="phone" 
                        value={customerPhone} 
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").replace(/^(\d{2})(\d)/g, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2").substring(0, 15);
                          setCustomerPhone(val);
                        }} 
                        placeholder="(11) 99999-9999" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF *</Label>
                      <Input 
                        id="cpf" 
                        value={customerCpf} 
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})/, "$1-$2").replace(/(-\d{2})\d+?$/, "$1");
                          setCustomerCpf(val);
                        }} 
                        placeholder="000.000.000-00" 
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Pagamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-primary bg-primary/5 ring-1 ring-primary text-center">
                    <img 
                      src="https://assets.pagseguro.com.br/ps-bootstrap/v6.63.1/img/pagseguro/logo-pagseguro.png" 
                      alt="PagBank" 
                      className="h-10 mb-4"
                    />
                    <p className="text-sm font-medium">Você será redirecionado para o ambiente seguro do PagBank para concluir seu pagamento.</p>
                    <div className="flex gap-4 mt-6">
                      <div className="flex flex-col items-center gap-1 opacity-70">
                        <CreditCard className="h-6 w-6" />
                        <span className="text-[10px]">Cartão</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 opacity-70">
                        <QrCode className="h-6 w-6" />
                        <span className="text-[10px]">Pix</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 opacity-70">
                        <Package className="h-6 w-6" />
                        <span className="text-[10px]">Boleto</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-4 bg-secondary/20 rounded-xl border border-border">
                    <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Seus dados de pagamento são processados diretamente pelo PagBank. Não armazenamos informações de cartões em nosso servidor.
                    </p>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="street">Rua *</Label>
                          <Input 
                            id="street" 
                            value={addressInfo.street} 
                            onChange={(e) => updateAddressInfo('street', e.target.value)} 
                            placeholder="Nome da rua" 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="neighborhood">Bairro *</Label>
                          <Input 
                            id="neighborhood" 
                            value={addressInfo.neighborhood} 
                            onChange={(e) => updateAddressInfo('neighborhood', e.target.value)} 
                            placeholder="Seu bairro" 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="city_state">Cidade / UF *</Label>
                          <Input 
                            id="city_state" 
                            value={`${addressInfo.city}${addressInfo.state ? ` - ${addressInfo.state}` : ''}`} 
                            readOnly 
                            className="bg-secondary/50" 
                          />
                        </div>
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
                        <XCircle className="h-4 w-4" /> Erro na Consulta de Frete
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
                          className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${
                            selectedShipping === option.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-primary/50 hover:bg-secondary/20"
                          }`}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground text-sm">{option.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {option.estimated_days} dias úteis
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-primary text-base">
                                {option.price === 0 ? "GRÁTIS" : `R$ ${option.price.toFixed(2)}`}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
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

                <div className="space-y-3">
                  <Button
                    onClick={handlePagBankCheckout}
                    size="lg"
                    className="w-full rounded-xl bg-[#009EE3] hover:bg-[#008AC0] text-white font-bold h-14"
                    disabled={!!paymentRequirementsMessage || pagBankLoading}
                  >
                    {pagBankLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <img 
                        src="https://assets.pagseguro.com.br/ps-bootstrap/v6.63.1/img/pagseguro/logo-pagseguro.png" 
                        alt="PagSeguro" 
                        className="h-6 mr-2 invert brightness-0"
                      />
                    )}
                    Pagar com PagBank
                  </Button>
                  
                  <p className="text-xs text-center min-h-4 text-muted-foreground">
                    {paymentRequirementsMessage ?? "Pagamento seguro e garantido via PagBank."}
                  </p>
                </div>
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
