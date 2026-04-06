import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Search,
  Store,
  Trophy,
  Loader2,
  ExternalLink,
  AlertCircle,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMarkets } from "@/hooks/useMarkets";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ShoppingItem {
  name: string;
  quantity: string;
}

interface PriceResult {
  market: string;
  url: string;
  items: { name: string; price: number | null; found: boolean }[];
  total: number | null;
  error: string | null;
}

interface Props {
  items: ShoppingItem[];
}

export const PriceComparison = ({ items }: Props) => {
  const { markets, addMarket, removeMarket } = useMarkets();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState<PriceResult[] | null>(null);
  const { toast } = useToast();

  const handleAddMarket = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    addMarket(newName, newUrl);
    setNewName("");
    setNewUrl("");
    setDialogOpen(false);
  };

  const handleCompare = async () => {
    if (markets.length === 0) {
      toast({ title: "Cadastre pelo menos um mercado", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Adicione itens à lista primeiro", variant: "destructive" });
      return;
    }

    setComparing(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("compare-prices", {
        body: {
          items: items.map((i) => ({ name: i.name, quantity: i.quantity })),
          marketUrls: markets.map((m) => ({ name: m.name, url: m.url })),
        },
      });

      if (error) throw error;

      if (data?.success) {
        setResults(data.results);
      } else {
        toast({ title: data?.error || "Erro ao comparar", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao comparar preços", variant: "destructive" });
    } finally {
      setComparing(false);
    }
  };

  const cheapest = results
    ?.filter((r) => r.total != null)
    .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0];

  return (
    <div className="space-y-3">
      {/* Markets Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Store size={13} />
          Mercados ({markets.length})
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
              <Plus size={14} />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm mx-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">Novo Mercado</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Input
                placeholder="Nome (ex: Pão de Açúcar)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-xl h-11"
              />
              <Input
                placeholder="URL do site (ex: paodeacucar.com)"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="rounded-xl h-11"
              />
              <Button
                onClick={handleAddMarket}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                Adicionar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Market List */}
      {markets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {markets.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm"
            >
              <Store size={13} className="text-primary shrink-0" />
              <span className="font-medium text-card-foreground truncate max-w-[120px]">{m.name}</span>
              <button
                onClick={() => removeMarket(m.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Compare Button */}
      <Button
        onClick={handleCompare}
        disabled={comparing || markets.length === 0 || items.length === 0}
        className="w-full h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base gap-2"
      >
        {comparing ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Comparando preços...
          </>
        ) : (
          <>
            <Search size={18} />
            Comparar Preços
          </>
        )}
      </Button>

      {/* Results */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {results.map((result, idx) => {
              const isCheapest = cheapest && result.market === cheapest.market && result.total != null;
              return (
                <motion.div
                  key={result.market}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`bg-card rounded-xl border p-4 space-y-2 ${
                    isCheapest ? "border-success ring-2 ring-success/20" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isCheapest && <Trophy size={16} className="text-success" />}
                      <span className="font-display font-bold text-card-foreground">
                        {result.market}
                      </span>
                    </div>
                    {result.total != null ? (
                      <span
                        className={`text-lg font-bold ${
                          isCheapest ? "text-success" : "text-card-foreground"
                        }`}
                      >
                        R$ {result.total.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>

                  {result.error && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle size={12} />
                      {result.error}
                    </p>
                  )}

                  {result.items.length > 0 && (
                    <div className="space-y-1">
                      {result.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span
                            className={
                              item.found ? "text-card-foreground" : "text-muted-foreground line-through"
                            }
                          >
                            {item.name}
                          </span>
                          <span className={item.found ? "font-semibold text-card-foreground" : "text-muted-foreground"}>
                            {item.price != null ? `R$ ${item.price.toFixed(2)}` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                  >
                    <ExternalLink size={12} />
                    Ir ao site
                  </a>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
