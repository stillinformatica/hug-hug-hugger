CREATE POLICY "Admins can insert announced products"
ON public.announced_products
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete announced products"
ON public.announced_products
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));