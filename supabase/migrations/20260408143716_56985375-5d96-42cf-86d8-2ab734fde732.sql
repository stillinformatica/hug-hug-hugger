
DROP POLICY "Orders can be inserted by anyone" ON public.orders;
DROP POLICY "Orders can be updated by anyone" ON public.orders;

CREATE POLICY "Orders can be inserted by service role or authenticated"
ON public.orders FOR INSERT
WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY "Orders can be updated by service role"
ON public.orders FOR UPDATE
USING (auth.role() = 'service_role');
