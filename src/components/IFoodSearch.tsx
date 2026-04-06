import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Trophy,
  Loader2,
  ExternalLink,
  ShoppingBag,
  Clock,
  Truck,
  ClipboardCopy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductAlternatives } from "@/components/ProductAlternatives";

interface ShoppingItem {
  name: string;
  quantity: string;
}

interface MarketItem {
  name: string;
  price: number | null;
  found: boolean;
}

interface MarketResult {
  name: string;
  deliveryFee: number | null;
  deliveryTime: string;
  items: MarketItem[];
  estimatedTotal: number | null;
  ifoodSearchUrl: string;
}

interface Props {
  items: ShoppingItem[];
}

export const IFoodSearch = ({ items }: Props) => {
  const [searching, setSearching] = useState(false);
  const [markets, setMarkets] = useState<MarketResult[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  const getStoredAddress = () => {
    try {
      const raw = localStorage.getItem("delivery-address");
      if (!raw) return null;
      const addr = JSON.parse(raw);
      if (addr.street && addr.city) {
        return `${addr.street}, ${addr.number}${addr.neighborhood ? `, ${addr.neighborhood}` : ''}, ${addr.city}/${addr.state}${addr.zip ? ` - CEP ${addr.zip}` : ''}`;
      }
      return null;
    } catch { return null; }
  };

  const handleSearch = async () => {
    if (items.length === 0) {
      toast({ title: "Adicione itens à lista primeiro", variant: "destructive" });
      return;
    }

    const address = getStoredAddress();
    if (!address) {
      toast({ title: "Preencha o endereço de entrega primeiro para buscar mercados próximos", variant: "destructive" });
      return;
    }

    setSearching(true);
    setMarkets(null);

    try {
      const { data, error } = await supabase.functions.invoke("search-ifood", {
        body: {
          items: items.map((i) => ({ name: i.name, quantity: i.quantity })),
          address,
        },
      });

      if (error) throw error;

      if (data?.success && data?.markets?.length) {
        setMarkets(data.markets);
      } else {
        toast({
          title: data?.error || "Nenhum mercado encontrado",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao buscar no iFood", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleBuy = async (market: MarketResult) => {
    const listText = items.map((i) => `${i.quantity}x ${i.name}`).join("\n");

    try {
      await navigator.clipboard.writeText(listText);
      setCopied(market.name);
      toast({ title: "✅ Lista copiada! Cole no iFood para buscar os itens." });
      setTimeout(() => setCopied(null), 3000);
    } catch {
      toast({ title: "Não foi possível copiar a lista", variant: "destructive" });
    }

    // Open the market's iFood URL directly
    window.open(market.ifoodSearchUrl || `https://www.ifood.com.br/busca?q=${encodeURIComponent(market.name)}`, "_blank");
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <ShoppingBag size={13} />
        Buscar no iFood
      </p>

      {/* Search Button */}
      <Button
        onClick={handleSearch}
        disabled={searching || items.length === 0}
        className="w-full h-12 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold text-base gap-2"
      >
        {searching ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Buscando mercados no iFood...
          </>
        ) : (
          <>
            <Search size={18} />
            Buscar Mercados no iFood
          </>
        )}
      </Button>

      {/* Results */}
      <AnimatePresence>
        {markets && markets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {markets.map((market, idx) => {
              const isCheapest = idx === 0 && market.estimatedTotal != null;
              return (
                <motion.div
                  key={market.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`bg-card rounded-xl border p-4 space-y-3 ${
                    isCheapest
                      ? "border-success ring-2 ring-success/20"
                      : "border-border"
                  }`}
                >
                  {/* Market Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isCheapest && (
                        <Trophy size={16} className="text-success" />
                      )}
                      <span className="font-display font-bold text-card-foreground">
                        {market.name}
                      </span>
                    </div>
                    {market.estimatedTotal != null ? (
                      <span
                        className={`text-lg font-bold ${
                          isCheapest ? "text-success" : "text-card-foreground"
                        }`}
                      >
                        R$ {market.estimatedTotal.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Delivery Info */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {market.deliveryTime && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {market.deliveryTime}
                      </span>
                    )}
                    {market.deliveryFee != null && (
                      <span className="flex items-center gap-1">
                        <Truck size={12} />
                        {market.deliveryFee === 0
                          ? "Entrega grátis"
                          : `R$ ${market.deliveryFee.toFixed(2)}`}
                      </span>
                    )}
                  </div>

                  {/* Items */}
                  {market.items.length > 0 && (
                    <div className="space-y-1">
                      {market.items.map((item, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between text-sm">
                            <span
                              className={
                                item.found
                                  ? "text-card-foreground"
                                  : "text-muted-foreground line-through"
                              }
                            >
                              {item.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={
                                  item.found
                                    ? "font-semibold text-card-foreground"
                                    : "text-muted-foreground"
                                }
                              >
                                {item.price != null
                                  ? `R$ ${item.price.toFixed(2)}`
                                  : "—"}
                              </span>
                              <ProductAlternatives
                                itemName={item.name}
                                marketName={market.name}
                                marketUrl={market.ifoodSearchUrl}
                                onSwap={(newName) => {
                                  // Update the item name in the market results
                                  setMarkets((prev) =>
                                    prev?.map((m) =>
                                      m.name === market.name
                                        ? {
                                            ...m,
                                            items: m.items.map((it, idx) =>
                                              idx === i ? { ...it, name: newName } : it
                                            ),
                                          }
                                        : m
                                    ) || null
                                  );
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Buy on iFood Button */}
                  <Button
                    onClick={() => handleBuy(market)}
                    className={`w-full h-11 rounded-xl font-semibold text-sm gap-2 ${
                      isCheapest
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "bg-card border border-destructive/30 text-destructive hover:bg-destructive/10"
                    }`}
                    variant={isCheapest ? "default" : "outline"}
                  >
                    {copied === market.name ? (
                      <>
                        <Check size={14} />
                        Lista copiada! Abrindo iFood...
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={14} />
                        Copiar lista e abrir no iFood
                      </>
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
