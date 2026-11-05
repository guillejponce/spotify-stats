-- ============================================================================
-- 006 — Last.fm como fuente de reproducciones para cuentas sin Spotify.
-- Correr después de 001–005. Idempotente.
-- El cron cada 5 minutos está aparte, en supabase/lastfm_cron.sql.
-- ============================================================================

-- Una cuenta de Last.fm por usuario. `session_key` no vence salvo que la
-- persona revoque el acceso en last.fm; solo lo lee el servidor.
CREATE TABLE IF NOT EXISTS public.lastfm_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  session_key text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  -- Cursor: hora (inicio) del último scrobble ya procesado.
  last_scrobble_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  profile_url text,
  avatar_url text,
  country text,
  total_scrobbles bigint
);

CREATE UNIQUE INDEX IF NOT EXISTS lastfm_accounts_username_unique
  ON public.lastfm_accounts (lower(username));

ALTER TABLE public.lastfm_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lastfm_accounts FROM anon, authenticated;
GRANT ALL ON public.lastfm_accounts TO service_role;

-- Equivalencia Last.fm → canción del catálogo (compartida entre usuarios).
-- `track_id` NULL = se buscó y no se encontró; se reintenta después de `retry_after`.
CREATE TABLE IF NOT EXISTS public.lastfm_track_map (
  match_key text PRIMARY KEY,
  artist_name text NOT NULL,
  track_name text NOT NULL,
  track_id text REFERENCES public.tracks(id) ON DELETE SET NULL,
  searched_at timestamptz NOT NULL DEFAULT now(),
  retry_after timestamptz
);

ALTER TABLE public.lastfm_track_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lastfm_track_map FROM anon, authenticated;
GRANT ALL ON public.lastfm_track_map TO service_role;

-- Spotify vence los refresh tokens a los 6 meses: se marca para pedir reconexión.
ALTER TABLE public.spotify_tokens
  ADD COLUMN IF NOT EXISTS needs_reconnect boolean NOT NULL DEFAULT false;

-- Evita que el id de Google quede guardado como id de Spotify al crear el perfil.
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
  v_is_spotify boolean := coalesce(NEW.raw_app_meta_data ->> 'provider', '') = 'spotify';
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
    coalesce(
      NEW.raw_user_meta_data ->> 'avatar_url',
      NEW.raw_user_meta_data ->> 'picture'
    ),
    CASE WHEN v_is_spotify THEN coalesce(
      NEW.raw_user_meta_data ->> 'provider_id',
      NEW.raw_user_meta_data ->> 'sub'
    ) END,
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

-- Al subir el zip: borra las reproducciones de Last.fm que el zip ya trae.
-- Last.fm marca el inicio y el zip el final, así que se compara con ventana.
CREATE OR REPLACE FUNCTION public.dedupe_lastfm_plays(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.plays l
  USING public.plays z
  WHERE l.user_id = p_user_id
    AND l.source = 'lastfm'
    AND z.user_id = p_user_id
    AND z.source IS DISTINCT FROM 'lastfm'
    AND z.track_id = l.track_id
    AND z.played_at BETWEEN l.played_at - interval '3 minutes'
                        AND l.played_at + make_interval(secs => coalesce(l.ms_played, 0) / 1000.0)
                                        + interval '3 minutes';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_lastfm_plays(uuid) FROM public, anon, authenticated;
