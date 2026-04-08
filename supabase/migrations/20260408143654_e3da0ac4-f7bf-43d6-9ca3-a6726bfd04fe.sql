
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_id TEXT NOT NULL,
  pagbank_id TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED',
  customer_name TEXT,
  customer_email TEXT,
  total_amount INTEGER NOT NULL DEFAULT 0,
  items JSONB,
  shipping_address JSONB,
  notification_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Orders are publicly readable for webhook updates"
ON public.orders FOR SELECT USING (true);

CREATE POLICY "Orders can be inserted by anyone"
ON public.orders FOR INSERT WITH CHECK (true);

CREATE POLICY "Orders can be updated by anyone"
ON public.orders FOR UPDATE USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
