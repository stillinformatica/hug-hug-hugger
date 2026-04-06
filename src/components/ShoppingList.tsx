import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Trash2, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePurchaseHistory } from "@/hooks/usePurchaseHistory";
import { PurchaseSuggestions } from "@/components/PurchaseSuggestions";
import { ProductAlternatives } from "@/components/ProductAlternatives";
import { DeliveryAddress } from "@/components/DeliveryAddress";
import { IFoodSearch } from "@/components/IFoodSearch";
import { MercadoLivreSearch } from "@/components/MercadoLivreSearch";

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  quantity: string;
}

export const ShoppingList = () => {
  const [items, setItems] = useState<ShoppingItem[]>([
    { id: "1", name: "Arroz 5kg", checked: false, quantity: "1" },
    { id: "2", name: "Feijão preto", checked: false, quantity: "2" },
    { id: "3", name: "Leite integral", checked: true, quantity: "3" },
    { id: "4", name: "Pão de forma", checked: false, quantity: "1" },
    { id: "5", name: "Banana", checked: true, quantity: "1kg" },
  ]);
  const [newItem, setNewItem] = useState("");
  const [newQty, setNewQty] = useState("1");
  const { recordPurchase, getSuggestions } = usePurchaseHistory();
  const suggestions = getSuggestions();

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems([
      ...items,
      { id: Date.now().toString(), name: newItem.trim(), checked: false, quantity: newQty || "1" },
    ]);
    setNewItem("");
    setNewQty("1");
  };

  const toggleItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item && !item.checked) {
      recordPurchase(item.name, item.quantity);
    }
    setItems(items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  };

  const addFromSuggestion = (name: string, qty: string) => {
    setItems([
      ...items,
      { id: Date.now().toString(), name, checked: false, quantity: qty },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const swapItem = (id: string, newName: string) => {
    setItems(items.map((i) => (i.id === id ? { ...i, name: newName } : i)));
  };

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="space-y-4">
      {/* Add Item */}
      <div className="flex gap-2">
        <Input
          placeholder="Adicionar item..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          className="flex-1 bg-card border-border rounded-xl h-12 text-base"
        />
        <Input
          placeholder="Qtd"
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
          className="w-16 bg-card border-border rounded-xl h-12 text-center text-base"
        />
        <Button
          onClick={addItem}
          size="icon"
          className="h-12 w-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <Plus size={20} />
        </Button>
      </div>

      {/* Suggestions */}
      <PurchaseSuggestions suggestions={suggestions} onAddItem={addFromSuggestion} />

      {/* Progress */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: items.length ? `${(checked.length / items.length) * 100}%` : "0%" }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <span className="text-sm font-semibold text-muted-foreground">
          {checked.length}/{items.length}
        </span>
      </div>

      {/* Pending Items */}
      <div className="space-y-2">
        <AnimatePresence>
          {unchecked.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="bg-card rounded-xl p-3 border border-border shadow-sm"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleItem(item.id)}
                  className="w-7 h-7 rounded-lg border-2 border-primary/40 flex items-center justify-center shrink-0 hover:border-primary transition-colors"
                >
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-base font-medium text-card-foreground truncate block">
                    {item.name}
                  </span>
                </div>
                <span className="text-sm font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">
                  {item.quantity}
                </span>
                <ProductAlternatives
                  itemName={item.name}
                  onSwap={(newName) => swapItem(item.id, newName)}
                />
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Checked Items */}
      {checked.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Concluídos ({checked.length})
          </p>
          <AnimatePresence>
            {checked.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -100 }}
                className="flex items-center gap-3 bg-muted/50 rounded-xl p-3 border border-border/50"
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0"
                >
                  <Check size={14} className="text-primary-foreground" />
                </button>
                <span className="flex-1 text-base text-muted-foreground line-through truncate">
                  {item.name}
                </span>
                <span className="text-sm text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-lg">
                  {item.quantity}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* iFood Search & Delivery */}
      {unchecked.length > 0 && (
        <>
          <MercadoLivreSearch items={unchecked.map((i) => ({ name: i.name, quantity: i.quantity }))} onAddToList={addFromSuggestion} />
          <DeliveryAddress />
          <IFoodSearch items={unchecked.map((i) => ({ name: i.name, quantity: i.quantity }))} />
        </>
      )}

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ShoppingCart size={48} className="mb-3 opacity-30" />
          <p className="text-lg font-semibold">Lista vazia</p>
          <p className="text-sm">Adicione itens para começar</p>
        </div>
      )}
    </div>
  );
};
