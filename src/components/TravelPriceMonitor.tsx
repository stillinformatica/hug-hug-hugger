import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingDown, Loader2, Bell, BellOff, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PriceCheck {
  price: number | null;
  currency: string;
  description: string;
  found: boolean;
  checkedAt: string;
  decolarUrl?: string;
}

interface Props {
  tripId: string;
  tripTitle: string;
  externalLink: string;
  startDate: string;
  endDate: string;
  initialPrice?: number | null;
  onPriceUpdate?: (tripId: string, price: number) => void;
}

export const TravelPriceMonitor = ({
  tripId,
  tripTitle,
  externalLink,
  startDate,
  endDate,
  initialPrice,
  onPriceUpdate,
}: Props) => {
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<PriceCheck | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const { toast } = useToast();

  const checkPrice = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-travel-prices", {
        body: {
          url: externalLink || undefined,
          title: tripTitle,
          startDate,
          endDate,
          searchDecolar: true,
        },
      });

      if (error) throw error;

      if (data?.success && data.found) {
        setLastCheck({
          price: data.price,
          currency: data.currency || "BRL",
          description: data.description || "",
          found: true,
          checkedAt: data.checkedAt,
          decolarUrl: data.decolarUrl,
        });

        if (data.price && onPriceUpdate) {
          onPriceUpdate(tripId, data.price);
        }

        if (initialPrice && data.price && data.price < initialPrice) {
          const drop = (((initialPrice - data.price) / initialPrice) * 100).toFixed(0);
          toast({
            title: `🎉 Preço caiu ${drop}%!`,
            description: `${tripTitle}: de R$ ${initialPrice.toFixed(2)} para R$ ${data.price.toFixed(2)}`,
          });
        }
      } else {
        toast({ title: "Preço não encontrado", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao verificar preço", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const toggleMonitoring = () => {
    setMonitoring(!monitoring);
    toast({
      title: monitoring ? "Monitoramento desativado" : "Monitoramento ativado",
      description: monitoring ? undefined : "Você será alertado quando o preço cair",
    });
  };

  const priceDropped = lastCheck?.price && initialPrice && lastCheck.price < initialPrice;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={checkPrice}
          disabled={checking}
          className="rounded-lg text-xs font-semibold h-8 gap-1 border-travel/30 text-travel hover:bg-travel/10"
        >
          {checking ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Search size={13} />
          )}
          {checking ? "Buscando..." : "Buscar na Decolar"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleMonitoring}
          className={`rounded-lg text-xs font-semibold h-8 gap-1 ${
            monitoring
              ? "bg-travel/10 text-travel border-travel/30"
              : "border-border text-muted-foreground"
          }`}
        >
          {monitoring ? <Bell size={13} /> : <BellOff size={13} />}
          {monitoring ? "Alertando" : "Alertar"}
        </Button>
      </div>

      <AnimatePresence>
        {lastCheck?.found && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-lg p-2.5 text-sm ${
              priceDropped
                ? "bg-success/10 border border-success/30"
                : "bg-muted/50 border border-border/50"
            }`}
          >
            <div className="flex items-center gap-2">
              {priceDropped && <TrendingDown size={14} className="text-success" />}
              <span className={`font-bold ${priceDropped ? "text-success" : "text-card-foreground"}`}>
                R$ {lastCheck.price?.toFixed(2)}
              </span>
              {initialPrice && (
                <span className="text-xs text-muted-foreground">
                  (inicial: R$ {initialPrice.toFixed(2)})
                </span>
              )}
            </div>
            {lastCheck.description && (
              <p className="text-xs text-muted-foreground mt-1">{lastCheck.description}</p>
            )}
            {lastCheck.decolarUrl && (
              <a
                href={lastCheck.decolarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-travel font-semibold hover:underline mt-1 inline-block"
              >
                Ver na Decolar →
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
