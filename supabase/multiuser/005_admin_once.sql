-- ============================================================================
-- 005 — El email de admin solo otorga admin si todavía no hay un admin activo.
-- Permite apagar "Confirm email" en Supabase Auth: Spotify no informa si el
-- email está verificado, así que otra cuenta podría declarar el mismo email.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(NEW.email);
  v_is_admin boolean;
  v_invited boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.app_config c WHERE c.admin_email = v_email)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles pr WHERE pr.role = 'admin' AND pr.status = 'active'
     )
  INTO v_is_admin;
  SELECT EXISTS (SELECT 1 FROM public.invites i WHERE i.email = v_email AND i.used_at IS NULL)
  INTO v_invited;

  INSERT INTO public.profiles (
    id, email, display_name, avatar_url, spotify_user_id, role, status
  )
  VALUES (
    NEW.id,
    v_email,
    coalesce(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.raw_user_meta_data ->> 'avatar_url',
    coalesce(
      NEW.raw_user_meta_data ->> 'provider_id',
      NEW.raw_user_meta_data ->> 'sub'
    ),
    CASE WHEN v_is_admin THEN 'admin' ELSE 'user' END,
    CASE WHEN v_is_admin OR v_invited THEN 'active' ELSE 'pending' END
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_invited THEN
    UPDATE public.invites SET used_at = now()
    WHERE email = v_email AND used_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;
