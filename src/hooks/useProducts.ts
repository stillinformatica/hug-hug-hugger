import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fallbackProducts, filterProducts, normalizeProduct, normalizeProducts } from '@/lib/catalog';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  images: string[];
  created_at: string;
}

export function useProducts(searchQuery?: string) {
  return useQuery({
    queryKey: ['products', searchQuery],
    queryFn: async () => {
      try {
        let query = supabase
          .from('announced_products')
          .select('*')
          .order('created_at', { ascending: false });

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const normalizedProducts = normalizeProducts(data as Product[] | null | undefined);
        return normalizedProducts.length > 0 ? normalizedProducts : filterProducts(fallbackProducts, searchQuery);
      } catch {
        return filterProducts(fallbackProducts, searchQuery);
      }
    },
    retry: false,
  });
}

export function useProductById(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('announced_products')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return normalizeProduct(data as Product);
      } catch {
        return fallbackProducts.find((product) => product.id === id) ?? null;
      }
    },
    enabled: !!id,
    retry: false,
  });
}
