import { motion } from "framer-motion";
import { ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShoppingItem {
  name: string;
  quantity: string;
}

interface Props {
  items: ShoppingItem[];
}

export const DeliveryOptions = ({ items }: Props) => {
  const itemsText = items.map((i) => `${i.quantity}x ${i.name}`).join(", ");

  const openIFood = () => {
    // iFood deep link - opens the app or website
    const encoded = encodeURIComponent(itemsText);
    // Try native app first, fallback to web
    window.open(`https://www.ifood.com.br/busca?q=${encoded}`, "_blank");
  };

  const openRappi = () => {
    const encoded = encodeURIComponent(itemsText);
    window.open(`https://www.rappi.com.br/buscar?term=${encoded}`, "_blank");
  };

  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <ShoppingBag size={13} />
        Pedir Entrega
      </p>
      <div className="flex gap-2">
        <Button
          onClick={openIFood}
          variant="outline"
          className="flex-1 h-11 rounded-xl font-semibold text-sm gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <ExternalLink size={14} />
          iFood
        </Button>
        <Button
          onClick={openRappi}
          variant="outline"
          className="flex-1 h-11 rounded-xl font-semibold text-sm gap-2 border-accent/50 text-accent hover:bg-accent/10"
        >
          <ExternalLink size={14} />
          Rappi
        </Button>
      </div>
    </motion.div>
  );
};
