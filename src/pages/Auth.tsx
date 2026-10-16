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
import { OwnerMfa } from "@/components/OwnerMfa";
import { OWNER_USER_ID } from "../../supabase/functions/_shared/access-rules";

const Auth = () => {
  const navigate = useNavigate();
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || data.user?.id !== OWNER_USER_ID) {
        await supabase.auth.signOut();
        throw new Error("Acesso não autorizado");
      }
      setPassword("");
      setMfaRequired(true);
    } catch {
      toast.error("Não foi possível entrar. Confira seus dados de acesso.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logo} alt="Still Informática" className="h-16 w-16 mx-auto mb-2 rounded-lg object-cover" />
          <CardTitle className="text-2xl">Entrar</CardTitle>
          <CardDescription>
            Acesso exclusivo à administração Still Informática
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfaRequired ? <OwnerMfa onVerified={() => navigate("/admin", { replace: true })} /> : <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>}
          <div className="mt-2 text-center">
            <Button variant="link" onClick={() => navigate("/")} className="text-sm text-muted-foreground">
              Voltar à loja
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
