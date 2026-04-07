import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, ImageIcon, Pencil, X } from "lucide-react";
import type { Product } from "@/hooks/useProducts";

interface ProductForm {
  name: string;
  description: string;
  category: string;
  price: string;
  imageUrl: string;
}

const emptyForm: ProductForm = { name: "", description: "", category: "", price: "", imageUrl: "" };

const ProductsManager = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const fetchProducts = async () => {
    const { data } = await supabase.from("announced_products").select("*").order("created_at", { ascending: false });
    setProducts((data || []) as unknown as Product[]);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (p: Product) => {
    setForm({
      name: p.name,
      description: p.description || "",
      category: p.category || "",
      price: String(p.price),
      imageUrl: p.images?.[0] || "",
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) { toast.error("Nome e preço são obrigatórios"); return; }
    setSaving(true);
    const images = form.imageUrl ? [form.imageUrl] : [];
    const payload = {
      name: form.name,
      description: form.description || null,
      category: form.category || null,
      price: parseFloat(form.price),
      images: images as any,
    };

    if (editingId) {
      const { error } = await supabase.from("announced_products").update(payload).eq("id", editingId);
      if (error) {
        toast.error("Erro ao atualizar produto");
      } else {
        toast.success("Produto atualizado!");
        resetForm();
        fetchProducts();
      }
    } else {
      const { error } = await supabase.from("announced_products").insert([payload]);
      if (error) {
        toast.error("Erro ao adicionar produto");
      } else {
        toast.success("Produto adicionado!");
        resetForm();
        fetchProducts();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este produto?")) return;
    const { error } = await supabase.from("announced_products").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover produto");
    } else {
      toast.success("Produto removido!");
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gerenciar Produtos</CardTitle>
            <CardDescription>Adicione, edite e remova produtos da loja</CardDescription>
          </div>
          <Button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} className="gap-2">
            {showForm ? <><X className="h-4 w-4" /> Cancelar</> : <><Plus className="h-4 w-4" /> Novo Produto</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showForm && (
          <div className="p-4 border border-border rounded-xl space-y-4 bg-secondary/30">
            <h3 className="font-semibold text-foreground">{editingId ? "Editar Produto" : "Novo Produto"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do produto" />
              </div>
              <div className="space-y-2">
                <Label>Preço *</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="99.90" />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Eletrônicos" />
              </div>
              <div className="space-y-2">
                <Label>URL da Imagem</Label>
                <Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição do produto" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? "Atualizar" : "Salvar"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>Cancelar Edição</Button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum produto cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {products.map(p => (
              <div key={p.id} className="flex items-center gap-4 p-3 border border-border rounded-xl">
                <div className="w-12 h-12 bg-secondary rounded-lg overflow-hidden flex-shrink-0">
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.category || "Sem categoria"} • R$ {Number(p.price).toFixed(2).replace(".", ",")}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductsManager;
