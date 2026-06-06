-- No changes needed to the SQL schema, but I will deploy a fix to the Edge Function.
-- The current function fails when source_ids is a large array and uses a string-based 'in' filter.
-- I will rewrite the function to use a more robust approach.
SELECT 1;