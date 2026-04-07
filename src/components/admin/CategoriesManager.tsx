import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Tag } from "lucide-react";

const CategoriesManager = () => {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("announced_products")
      .select("category")
      .not("category", "is", null);
    const unique = [...new Set((data || []).map(d => d.category).filter(Boolean))] as string[];
    unique.sort((a, b) => a.localeCompare(b));
    setCategories(unique);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) {
      toast.error("Categoria já existe");
      return;
    }
    // Categories are derived from products, so we just inform the user
    toast.info("Use esta categoria ao cadastrar um produto para que ela apareça aqui.");
    setNewCategory("");
  };

  const handleRemoveCategory = async (cat: string) => {
    if (!confirm(`Remover a categoria "${cat}" de todos os produtos?`)) return;
    const { error } = await supabase
      .from("announced_products")
      .update({ category: null })
      .eq("category", cat);
    if (error) {
      toast.error("Erro ao remover categoria");
    } else {
      toast.success(`Categoria "${cat}" removida dos produtos`);
      fetchCategories();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> Categorias</CardTitle>
        <CardDescription>Categorias são extraídas dos produtos cadastrados. Remover uma categoria limpa ela de todos os produtos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            placeholder="Dica: defina a categoria ao cadastrar o produto"
            className="flex-1"
          />
          <Button onClick={handleAddCategory} size="icon" variant="outline" disabled={!newCategory.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : categories.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">Nenhuma categoria encontrada. Adicione categorias ao cadastrar produtos.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <Badge key={cat} variant="secondary" className="text-sm py-1.5 px-3 gap-2">
                {cat}
                <button onClick={() => handleRemoveCategory(cat)} className="hover:text-destructive transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CategoriesManager;
