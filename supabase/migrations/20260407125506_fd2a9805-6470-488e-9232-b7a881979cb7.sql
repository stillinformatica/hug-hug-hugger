
CREATE TABLE public.announced_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.announced_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view announced products"
ON public.announced_products
FOR SELECT
USING (true);

CREATE POLICY "Service role can insert announced products"
ON public.announced_products
FOR INSERT
TO service_role
WITH CHECK (true);
