import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight, Loader2, X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMarkets } from "@/hooks/useMarkets";
import { useToast } from "@/hooks/use-toast";

interface Alternative {
  name: string;
  brand: string;
  price: number | null;
  reason: string;
}

interface Props {
  itemName: string;
  onSwap: (newName: string) => void;
  marketName?: string;
  marketUrl?: string;
}

export const ProductAlternatives = ({ itemName, onSwap, marketName, marketUrl }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const { markets } = useMarkets();
  const { toast } = useToast();

  const fetchAlternatives = async () => {
    if (open && alternatives.length > 0) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setLoading(true);
    setAlternatives([]);

    const market = markets[0]; // Fallback to first registered market

    try {
      const { data, error } = await supabase.functions.invoke("find-alternatives", {
        body: {
          itemName,
          marketUrl: marketUrl || market?.url || "https://www.paodeacucar.com",
          marketName: marketName || market?.name || "Mercado",
        },
      });

      if (error) throw error;

      if (data?.success && data.alternatives?.length > 0) {
        setAlternatives(data.alternatives);
      } else {
        toast({ title: "Nenhuma alternativa encontrada", variant: "destructive" });
        setOpen(false);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao buscar alternativas", variant: "destructive" });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = (alt: Alternative) => {
    onSwap(alt.name);
    setOpen(false);
    toast({ title: `Trocado para ${alt.name}` });
  };

  return (
    <div>
      <button
        onClick={fetchAlternatives}
        className="text-primary hover:text-primary/80 transition-colors p-1"
        title="Trocar produto"
      >
        <ArrowLeftRight size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 bg-muted/50 rounded-xl p-3 space-y-2 border border-border/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Alternativas
                </p>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Buscando alternativas...</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {alternatives.map((alt, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => handleSwap(alt)}
                      className="w-full flex items-center gap-2 bg-card rounded-lg p-2.5 border border-border text-left hover:border-primary/50 transition-colors"
                    >
                      <Tag size={14} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-card-foreground block truncate">
                          {alt.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{alt.brand}</span>
                      </div>
                      {alt.price != null && (
                        <span className="text-sm font-bold text-primary shrink-0">
                          R$ {alt.price.toFixed(2)}
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
