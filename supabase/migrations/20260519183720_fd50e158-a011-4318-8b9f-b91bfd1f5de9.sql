ALTER TABLE public.orders ALTER COLUMN total_amount TYPE numeric;
-- Also ensure status has a default if not already set correctly
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'CREATED';
