import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface OwnerMfaProps { onVerified: () => void }

export function OwnerMfa({ onVerified }: OwnerMfaProps) {
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepare() {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const verified = data.totp.find(factor => factor.status === "verified");
        if (verified) {
          if (active) setFactorId(verified.id);
        } else {
          for (const factor of data.all.filter(item => item.status === "unverified" && item.factor_type === "totp")) {
            const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
            if (removeError) throw removeError;
          }
          const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Still Administração", issuer: "Still Informatica" });
          if (enrollError) throw enrollError;
          if (active) { setFactorId(enrolled.id); setQr(enrolled.totp.qr_code); }
        }
      } catch {
        if (active) { setFailed(true); toast.error("Não foi possível preparar a verificação. Entre novamente."); }
      } finally { if (active) setBusy(false); }
    }
    void prepare();
    return () => { active = false; };
  }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      setQr(""); setCode("");
      onVerified();
    } catch { toast.error("Código inválido ou expirado. Tente novamente."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Verificação em duas etapas</h2>
      {qr && <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Adicione esta conta ao Google Authenticator ou Microsoft Authenticator.</p>
        <img src={qr.startsWith("data:") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="QR code para seu autenticador" width={220} height={220} className="mx-auto" />
      </div>}
      <Label htmlFor="mfa-code">Código do autenticador</Label>
      <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required disabled={busy || failed} />
      <Button className="w-full" disabled={busy || failed || code.length !== 6}>{busy ? "Aguarde…" : "Confirmar acesso"}</Button>
    </form>
  );
}