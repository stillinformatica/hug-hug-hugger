import { Link } from "react-router-dom";
import { ShoppingCart, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cartStore";
import type { Product } from "@/hooks/useProducts";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface ProductCardProps {
  product: Product;
  index: number;
}

export const ProductCard = ({ product, index }: ProductCardProps) => {
  const addItem = useCartStore(state => state.addItem);
  const image = product.images?.[0];
  const isConsulte = Number(product.price) === 0;

  const productUrl = `${window.location.origin}/produto/${product.id}`;
  const whatsappUrl = `https://wa.me/5511982596096?text=${encodeURIComponent(`Olá! Gostaria de saber o preço deste produto: ${product.name}\n${productUrl}`)}`;

  const handleConsulte = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(whatsappUrl, "_blank");
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    toast.success("Adicionado ao carrinho!", { description: product.name });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.5) }}
    >
      <Link
        to={`/produto/${product.id}`}
        className="group block bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
      >
        <div className="aspect-square bg-secondary/50 overflow-hidden relative">
          {image ? (
            <img
              src={image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ShoppingCart className="h-12 w-12 opacity-20" />
            </div>
          )}
        </div>
        <div className="p-3 space-y-1.5">
          <h3 className="font-semibold text-foreground text-xs line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          <p className="text-[11px] text-muted-foreground line-clamp-1">{product.description}</p>
          <div className="flex items-center justify-between pt-0.5">
            {isConsulte ? (
              <Button
                size="sm"
                onClick={handleConsulte}
                className="rounded-xl text-xs gap-1.5 w-full bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="h-3 w-3" />
                CONSULTE
              </Button>
            ) : (
              <>
                <span className="text-sm font-bold text-primary">
                  R$ {Number(product.price).toFixed(2).replace(".", ",")}
                </span>
                <Button
                  size="sm"
                  onClick={handleAddToCart}
                  className="rounded-xl text-xs gap-1.5"
                >
                  <ShoppingCart className="h-3 w-3" />
                  <span className="hidden lg:inline">Comprar</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
};
