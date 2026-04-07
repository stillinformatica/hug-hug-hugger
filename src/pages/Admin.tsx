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
import { Loader2, ArrowLeft, Save, MapPin, Package, Settings, Tag } from "lucide-react";
import logo from "@/assets/logo.png";
import ProductsManager from "@/components/admin/ProductsManager";
import CategoriesManager from "@/components/admin/CategoriesManager";

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
            <TabsTrigger value="categories" className="gap-2"><Tag className="h-4 w-4" />Categorias</TabsTrigger>
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

          <TabsContent value="categories">
            <CategoriesManager />
          </TabsContent>

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
