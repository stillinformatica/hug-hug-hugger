CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    AND (_role <> 'admin'::public.app_role OR (
      _user_id = '1ed2a250-7ad8-4fcd-9567-763a3f6e5540'::uuid
      AND _user_id = auth.uid()
      AND (auth.jwt() ->> 'aal') = 'aal2'
    ));
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS 'Admin access requires the fixed owner identity and an authenticated MFA session. Other roles retain existing semantics.';