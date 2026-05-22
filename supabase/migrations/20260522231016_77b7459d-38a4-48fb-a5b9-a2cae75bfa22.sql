-- Fix search_path for critical functions to prevent search path hijacking
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- Revoke public execution for sensitive functions
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC;

-- Grant execution only to service_role (used by Edge Functions)
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Improve RLS for orders table (it was publicly readable)
DROP POLICY "Orders are publicly readable for webhook updates" ON public.orders;

CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can view all orders"
ON public.orders
FOR SELECT
TO service_role
USING (true);

-- Ensure orders insertion is still possible for checkout
DROP POLICY "Orders can be inserted by service role or authenticated" ON public.orders;
CREATE POLICY "Anyone can initiate an order"
ON public.orders
FOR INSERT
WITH CHECK (true);

-- Ensure authenticated users can see their own orders (if they have an email match)
CREATE POLICY "Users can view their own orders by email"
ON public.orders
FOR SELECT
USING (auth.jwt() ->> 'email' = customer_email);
