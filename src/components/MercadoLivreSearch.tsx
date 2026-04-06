import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  ExternalLink,
  ShoppingCart,
  Package,
  Check,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ShoppingItem {
  name: string;
  quantity: string;
}

interface MLProduct {
  itemName: string;
  quantity: string;
  productTitle: string;
  price: number | null;
  url: string;
  found: boolean;
}

interface Props {
  items: ShoppingItem[];
  onAddToList?: (name: string, quantity: string) => void;
}

export const MercadoLivreSearch = ({ items, onAddToList }: Props) => {
  const [searching, setSearching] = useState(false);
  const [products, setProducts] = useState<MLProduct[] | null>(null);
  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (items.length === 0) {
      toast({ title: "Adicione itens à lista primeiro", variant: "destructive" });
      return;
    }

    setSearching(true);
    setProducts(null);
    setEstimatedTotal(null);

    try {
      const { data, error } = await supabase.functions.invoke("search-mercadolivre", {
        body: { items: items.map((i) => ({ name: i.name, quantity: i.quantity })) },
      });

      if (error) throw error;

      if (data?.success && data?.products?.length) {
        setProducts(data.products);
        setEstimatedTotal(data.estimatedTotal ?? null);
      } else {
        toast({
          title: data?.error || "Nenhum produto encontrado",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao buscar no Mercado Livre", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleSwap = async (product: MLProduct) => {
    setSwapping(product.itemName);
    try {
      const { data, error } = await supabase.functions.invoke("search-mercadolivre", {
        body: { items: [{ name: `${product.itemName} alternativa similar`, quantity: product.quantity }] },
      });
      if (error) throw error;
      if (data?.success && data?.products?.length && data.products[0].found) {
        const alt = data.products[0];
        setProducts((prev) => {
          const updated = prev?.map((p) =>
            p.itemName === product.itemName
              ? { ...p, productTitle: alt.productTitle, price: alt.price, url: alt.url }
              : p
          ) ?? null;
          if (updated) {
            const total = updated.reduce((sum, p) => sum + (p.price ?? 0) * (parseInt(p.quantity) || 1), 0);
            setEstimatedTotal(total);
          }
          return updated;
        });
        toast({ title: `Trocado por: ${alt.productTitle}` });
      } else {
        toast({ title: "Nenhuma alternativa encontrada", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar alternativa", variant: "destructive" });
    } finally {
      setSwapping(null);
    }
  };

  const foundProducts = products?.filter((p) => p.found) || [];
  const notFoundProducts = products?.filter((p) => !p.found) || [];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Package size={13} />
        Buscar no Mercado Livre
      </p>

      <Button
        onClick={handleSearch}
        disabled={searching || items.length === 0}
        className="w-full h-12 rounded-xl bg-[hsl(55,90%,50%)] text-[hsl(55,90%,10%)] hover:bg-[hsl(55,90%,45%)] font-semibold text-base gap-2"
      >
        {searching ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Buscando no Mercado Livre...
          </>
        ) : (
          <>
            <Search size={18} />
            Buscar no Mercado Livre
          </>
        )}
      </Button>

      <AnimatePresence>
        {products && products.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Total + Buy All */}
            {estimatedTotal != null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-xl border border-success ring-2 ring-success/20 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart size={18} className="text-success" />
                    <span className="font-display font-bold text-card-foreground">
                      Total Estimado
                    </span>
                  </div>
                  <span className="text-xl font-bold text-success">
                    R$ {estimatedTotal.toFixed(2)}
                  </span>
                </div>
                {foundProducts.length > 0 && (
                  <Button
                    onClick={() => {
                      foundProducts.forEach((p, i) => {
                        setTimeout(() => window.open(p.url, "_blank"), i * 300);
                      });
                    }}
                    className="w-full h-11 rounded-xl bg-[hsl(55,90%,50%)] text-[hsl(55,90%,10%)] hover:bg-[hsl(55,90%,45%)] font-semibold gap-2"
                  >
                    <ExternalLink size={16} />
                    Abrir todos no Mercado Livre ({foundProducts.length} itens)
                  </Button>
                )}
              </motion.div>
            )}

            {/* Found Products */}
            <div className="space-y-2">
              {foundProducts.map((product, idx) => (
                <motion.div
                  key={`${product.itemName}-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-card rounded-xl border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Check size={14} className="text-success shrink-0" />
                        <span className="text-sm font-semibold text-card-foreground">
                          {product.quantity}x {product.itemName}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {product.productTitle}
                      </p>
                    </div>
                    <span className="text-base font-bold text-card-foreground whitespace-nowrap">
                      {product.price != null ? `R$ ${product.price.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => window.open(product.url, "_blank")}
                      className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5"
                    >
                      <ShoppingBag size={13} />
                      Comprar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSwap(product)}
                      disabled={swapping === product.itemName}
                      className="flex-1 h-8 rounded-lg text-xs font-semibold gap-1.5"
                    >
                      {swapping === product.itemName ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      Trocar
                    </Button>
                    {onAddToList && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onAddToList(product.productTitle, product.quantity);
                          toast({ title: `"${product.productTitle}" adicionado à lista` });
                        }}
                        className="h-8 w-8 rounded-lg p-0 shrink-0"
                      >
                        <Plus size={14} />
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Not Found */}
            {notFoundProducts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  Não encontrados ({notFoundProducts.length})
                </p>
                {notFoundProducts.map((product, idx) => (
                  <div
                    key={`nf-${idx}`}
                    className="flex items-center justify-between text-sm text-muted-foreground px-1"
                  >
                    <span className="line-through">
                      {product.quantity}x {product.itemName}
                    </span>
                    <a
                      href={`https://www.mercadolivre.com.br/jm/search?as_word=${encodeURIComponent(product.itemName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Search size={10} />
                      Buscar manual
                    </a>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
