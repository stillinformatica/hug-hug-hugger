import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      let query = supabase
        .from('announced_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Product[];
    },
  });
}

export function useProductById(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announced_products')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as Product;
    },
    enabled: !!id,
  });
}
