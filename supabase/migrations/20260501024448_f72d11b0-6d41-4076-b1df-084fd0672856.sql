-- Ajustando a função para ser segura
ALTER FUNCTION public.notify_order_shipping() SET search_path = public;

-- Revogando acesso de execução para usuários anônimos e autenticados
REVOKE EXECUTE ON FUNCTION public.notify_order_shipping() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_order_shipping() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_order_shipping() FROM authenticated;