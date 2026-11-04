-- ============================================================================
-- 002 — Asignar los datos existentes (single-user) a la cuenta admin.
-- Correr DESPUÉS de iniciar sesión con Spotify en la app nueva al menos una vez
-- (así existe tu fila en auth.users con el email de app_config.admin_email).
-- Idempotente: se puede volver a correr.
-- ============================================================================

SET statement_timeout = 0;

DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT u.id INTO v_admin
  FROM auth.users u
  INNER JOIN public.app_config c ON lower(u.email) = c.admin_email
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No hay usuario con el email de app_config.admin_email. Iniciá sesión primero.';
  END IF;

  INSERT INTO public.profiles (id, email, role, status)
  SELECT u.id, lower(u.email), 'admin', 'active'
  FROM auth.users u WHERE u.id = v_admin
  ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active', updated_at = now();

  UPDATE public.plays SET user_id = v_admin WHERE user_id IS NULL;
  UPDATE public.song_ratings SET user_id = v_admin WHERE user_id IS NULL;
  UPDATE public.imports SET user_id = v_admin WHERE user_id IS NULL;
  UPDATE public.push_subscriptions SET user_id = v_admin WHERE user_id IS NULL;
  UPDATE public.ranking_snapshots SET user_id = v_admin WHERE user_id IS NULL;
  UPDATE public.ranking_notifications_sent SET user_id = v_admin WHERE user_id IS NULL;
  UPDATE public.kurt_push_log SET user_id = v_admin WHERE user_id IS NULL;

  -- El token viejo ('default') queda obsoleto: el login con Spotify ya guardó uno por usuario.
  IF EXISTS (SELECT 1 FROM public.spotify_tokens WHERE user_id = v_admin) THEN
    DELETE FROM public.spotify_tokens WHERE user_id IS NULL;
  ELSE
    UPDATE public.spotify_tokens
    SET user_id = v_admin, id = v_admin::text
    WHERE id = 'default' AND user_id IS NULL;
    DELETE FROM public.spotify_tokens WHERE user_id IS NULL;
  END IF;

  PERFORM public.refresh_stats_rollups_for_user(v_admin);
END $$;

ALTER TABLE public.plays ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.song_ratings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.imports ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.spotify_tokens ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.ranking_snapshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.ranking_notifications_sent ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.kurt_push_log ALTER COLUMN user_id SET NOT NULL;

-- Suscripciones push huérfanas (si hubiera) no sirven sin usuario.
DELETE FROM public.push_subscriptions WHERE user_id IS NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN user_id SET NOT NULL;

-- Índices globales viejos que ya no usa ninguna consulta (todas filtran por user_id).
DROP INDEX IF EXISTS public.idx_plays_played_at;
DROP INDEX IF EXISTS public.idx_plays_played_at_covering;
DROP INDEX IF EXISTS public.idx_plays_played_at_no_skip_covering;
DROP INDEX IF EXISTS public.idx_plays_chile_date;
DROP INDEX IF EXISTS public.plays_played_at_idx;
