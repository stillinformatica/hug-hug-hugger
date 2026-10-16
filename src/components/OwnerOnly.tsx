import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export interface OwnerOnlyProps { children: ReactNode }
export function OwnerOnly({ children }: OwnerOnlyProps) {
  const { loading, isAdmin } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Verificando acesso" /></div>;
  return isAdmin ? <>{children}</> : <Navigate to="/auth" replace />;
}