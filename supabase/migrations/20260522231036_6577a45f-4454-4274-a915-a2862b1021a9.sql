-- Fix has_role security
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- Fix notify_order_shipping search path (already had it but reinforcing)
ALTER FUNCTION public.notify_order_shipping() SET search_path = public;

-- Fix permissive INSERT policy on orders
DROP POLICY "Anyone can initiate an order" ON public.orders;
CREATE POLICY "Anyone can initiate an order with required fields"
ON public.orders
FOR INSERT
WITH CHECK (
  customer_email IS NOT NULL AND 
  customer_name IS NOT NULL
);
