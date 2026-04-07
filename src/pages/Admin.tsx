import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, MapPin, Package, Settings, Plus, Trash2, ImageIcon } from "lucide-react";
import logo from "@/assets/logo.png";
import type { Product } from "@/hooks/useProducts";

interface SenderAddress {
  name: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

const emptyAddress: SenderAddress = {
  name: "", street: "", number: "", complement: "",
  neighborhood: "", city: "", state: "", zip: "", phone: "",
};

const ProductsManager = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", price: "", imageUrl: "" });

  const fetchProducts = async () => {
    const { data } = await supabase.from("announced_products").select("*").order("created_at", { ascending: false });
    setProducts((data || []) as unknown as Product[]);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleAdd = async () => {
    if (!form.name || !form.price) { toast.error("Nome e preço são obrigatórios"); return; }
    setSaving(true);
    const images = form.imageUrl ? [form.imageUrl] : [];
    const { error } = await supabase.from("announced_products").insert([{
      name: form.name,
      description: form.description || null,
      category: form.category || null,
      price: parseFloat(form.price),
      images: images as any,
    }]);
    if (error) {
      toast.error("Erro ao adicionar produto");
    } else {
      toast.success("Produto adicionado!");
      setForm({ name: "", description: "", category: "", price: "", imageUrl: "" });
      setShowForm(false);
      fetchProducts();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
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
            <CardDescription>Adicione, visualize e remova produtos da loja</CardDescription>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Produto
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showForm && (
          <div className="p-4 border border-border rounded-xl space-y-4 bg-secondary/30">
            <h3 className="font-semibold text-foreground">Novo Produto</h3>
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
            <Button onClick={handleAdd} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Produto
            </Button>
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
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [address, setAddress] = useState<SenderAddress>(emptyAddress);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      toast.error("Acesso restrito a administradores");
      navigate("/");
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const loadSettings = async () => {
      const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'sender_address')
        .maybeSingle();
      if (data?.value) {
        setAddress(data.value as unknown as SenderAddress);
      }
      setLoadingData(false);
    };
    loadSettings();
  }, [user, isAdmin]);

  const handleSaveAddress = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('admin_settings')
        .select('id')
        .eq('key', 'sender_address')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('admin_settings')
          .update({ value: JSON.parse(JSON.stringify(address)), updated_by: user!.id, updated_at: new Date().toISOString() })
          .eq('key', 'sender_address');
      } else {
        await supabase
          .from('admin_settings')
          .insert([{ key: 'sender_address', value: JSON.parse(JSON.stringify(address)), updated_by: user!.id }]);
      }
      toast.success("Endereço de remetente salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar endereço");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof SenderAddress, value: string) => {
    setAddress(prev => ({ ...prev, [field]: value }));
  };

  if (authLoading || loadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Admin" className="h-8 w-8 rounded-lg object-cover" />
            <h1 className="text-lg font-bold text-foreground">Painel Admin</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => { supabase.auth.signOut(); navigate("/"); }}>
            Sair
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <Tabs defaultValue="address">
          <TabsList className="mb-6">
            <TabsTrigger value="address" className="gap-2"><MapPin className="h-4 w-4" />Endereço Remetente</TabsTrigger>
            <TabsTrigger value="products" className="gap-2"><Package className="h-4 w-4" />Produtos</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" />Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="address">
            <Card>
              <CardHeader>
                <CardTitle>Endereço do Remetente</CardTitle>
                <CardDescription>Este endereço será usado como remetente para cálculo de frete</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome / Razão Social</Label>
                    <Input value={address.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Still Informática" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={address.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="(11) 99999-9999" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Rua</Label>
                    <Input value={address.street} onChange={(e) => updateField('street', e.target.value)} placeholder="Rua Exemplo" />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={address.number} onChange={(e) => updateField('number', e.target.value)} placeholder="123" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento</Label>
                    <Input value={address.complement} onChange={(e) => updateField('complement', e.target.value)} placeholder="Sala 1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input value={address.neighborhood} onChange={(e) => updateField('neighborhood', e.target.value)} placeholder="Centro" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={address.city} onChange={(e) => updateField('city', e.target.value)} placeholder="São Paulo" />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input value={address.state} onChange={(e) => updateField('state', e.target.value)} placeholder="SP" maxLength={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input value={address.zip} onChange={(e) => updateField('zip', e.target.value)} placeholder="01001-000" />
                  </div>
                </div>
                <Button onClick={handleSaveAddress} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Endereço
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <ProductsManager />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Configurações Gerais</CardTitle>
                <CardDescription>Configurações da loja</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Mais configurações em breve.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
