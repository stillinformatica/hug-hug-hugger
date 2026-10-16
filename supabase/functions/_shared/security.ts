import { createClient } from "npm:@supabase/supabase-js@2";
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
export async function requireAdmin(req: Request): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !key) throw json({ error: "Configuração incompleta" }, 503);
  // Internal calls use an exact server-only credential; never trust decoded JWT roles.
  if (token === key) return;
  if (!token) throw json({ error: "Autenticação necessária" }, 401);
  const client = createClient(url, key);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw json({ error: "Sessão inválida" }, 401);
  // The database applies owner identity AND MFA to the server-validated session.
  const caller = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: allowed, error: accessError } = await caller.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (accessError || allowed !== true) throw json({ error: "Acesso restrito: confirme a autenticação em duas etapas" }, 403);
}
export async function readBody(req: Request): Promise<unknown> {
  if (req.method !== "POST") throw json({ error: "Método não permitido" }, 405);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 100000) throw json({ error: "Solicitação muito grande" }, 413);
  try { return JSON.parse(text); } catch { throw json({ error: "JSON inválido" }, 400); }
}