import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, ShoppingBag } from "lucide-react";
import type { PurchaseSuggestion } from "@/hooks/usePurchaseHistory";

interface Props {
  suggestions: PurchaseSuggestion[];
  onAddItem: (name: string, qty: string) => void;
}

export const PurchaseSuggestions = ({ suggestions, onAddItem }: Props) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Clock size={13} />
        Hora de comprar novamente
      </p>
      <AnimatePresence>
        {suggestions.map((s) => (
          <motion.button
            key={s.itemName}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => onAddItem(s.itemName, s.lastQuantity)}
            className="w-full flex items-center gap-3 bg-secondary rounded-xl p-3 border border-border text-left hover:bg-secondary/80 transition-colors"
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                s.urgency === "now"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {s.urgency === "now" ? <AlertTriangle size={16} /> : <ShoppingBag size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-card-foreground capitalize truncate block">
                {s.itemName}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.urgency === "now"
                  ? `Compra a cada ~${s.avgIntervalDays}d · ${s.daysSinceLast}d sem comprar`
                  : `Faltam ~${s.avgIntervalDays - s.daysSinceLast}d para acabar`}
              </span>
            </div>
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">
              {s.lastQuantity}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};
