import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado com sucesso!");
        navigate("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        // Try to setup admin for the specific admin email
        if (email.toLowerCase() === "stillinformatica@stillinformatica.com.br") {
          try {
            await supabase.functions.invoke("setup-admin");
            toast.success("Conta de administrador criada com sucesso! Faça login.");
            setIsLogin(true);
          } catch {
            toast.success("Cadastro realizado! A configuração de admin será aplicada em breve.");
          }
        } else {
          toast.success("Cadastro realizado! Verifique seu e-mail para confirmar.");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar solicitação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logo} alt="Still Informática" className="h-16 w-16 mx-auto mb-2 rounded-lg object-cover" />
          <CardTitle className="text-2xl">{isLogin ? "Entrar" : "Criar Conta"}</CardTitle>
          <CardDescription>
            {isLogin ? "Acesse sua conta Still Informática" : "Cadastre-se para comprar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isLogin ? "Entrar" : "Cadastrar"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:underline">
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
            </button>
          </div>
          <div className="mt-2 text-center">
            <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:underline">
              Voltar à loja
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
