
DROP POLICY IF EXISTS "courts_insert_auth" ON public.courts;
REVOKE INSERT ON public.courts FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
