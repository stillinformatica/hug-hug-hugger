import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Product } from '@/hooks/useProducts';

export interface CartItem {
  productId: string;
  name: string;
  image: string | null;
  price: number;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  isLoading: boolean;
  addItem: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,

      addItem: (product, quantity = 1) => {
        const { items } = get();
        const existing = items.find(i => i.productId === product.id);
        if (existing) {
          set({
            items: items.map(i =>
              i.productId === product.id
                ? { ...i, quantity: i.quantity + quantity }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...items,
              {
                productId: product.id,
                name: product.name,
                image: product.images?.[0] || null,
                price: product.price,
                quantity,
              },
            ],
          });
        }
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map(i =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        });
      },

      removeItem: (productId) => {
        set({ items: get().items.filter(i => i.productId !== productId) });
      },

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);
