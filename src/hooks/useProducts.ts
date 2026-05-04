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
  weight?: number;
  height?: number;
  width?: number;
  length?: number;
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
          const terms = searchQuery.split(' ').filter(t => t.length > 0);
          
          // Se for uma busca exata por categoria (vinda dos links de navegação)
          const categories = [
            "Eletrônicos", "Computadores Montados", "Memórias", "Notebooks", 
            "Placa-mãe", "Processador", "Placa de Vídeo", "Fontes", 
            "Gabinetes", "Periféricos", "SSDs e HDs", "Segurança"
          ];
          
          const isCategorySearch = categories.some(cat => cat.toLowerCase() === searchQuery.toLowerCase());

          if (isCategorySearch) {
            // Se for categoria, filtra apenas pelo campo category
            query = query.ilike('category', `%${searchQuery}%`);
          } else {
            // Se for busca geral, mantém o comportamento de buscar no nome e descrição,
            // mas podemos ser mais restritivos se desejar.
            const orConditions = terms.map(term => 
              `name.ilike.%${term}%,description.ilike.%${term}%`
            ).join(',');
            query = query.or(orConditions);
          }
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
