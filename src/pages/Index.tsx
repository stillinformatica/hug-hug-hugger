import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { StoreHeader } from "@/components/store/StoreHeader";
import { HeroBanner } from "@/components/store/HeroBanner";
import { ProductCard } from "@/components/store/ProductCard";
import { StoreFooter } from "@/components/store/StoreFooter";
import { useProducts } from "@/hooks/useProducts";
import { Loader2, PackageOpen } from "lucide-react";

const Index = () => {
  const [searchParams] = useSearchParams();
  const qParam = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(qParam);

  const { data: products, isLoading } = useProducts(searchQuery || undefined);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StoreHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <HeroBanner />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            {searchQuery ? `Resultados para "${searchQuery}"` : "Todos os Produtos"}
          </h2>
          {products && products.length > 0 && (
            <span className="text-sm text-muted-foreground">{products.length} produtos</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product, index) => (
              <ProductCard key={product.node.id} product={product} index={index} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <PackageOpen className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-xl font-semibold">Nenhum produto encontrado</p>
            <p className="text-sm mt-1">Os produtos aparecerão aqui quando forem cadastrados.</p>
          </div>
        )}
      </main>

      <StoreFooter />
    </div>
  );
};

export default Index;
