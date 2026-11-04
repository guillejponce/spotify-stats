-- ============================================================================
-- 001 — Estructura multiusuario (correr ANTES de desplegar la rama multiuser).
--
-- Orden completo:
--   1) Reemplazá __ADMIN_EMAIL__ abajo por el email de tu cuenta de Spotify.
--   2) Corré este archivo.
--   3) Corré 003_rpcs.sql.
--   4) Desplegá la app, iniciá sesión con Spotify (tu usuario queda admin + active).
--   5) Corré 002_claim_admin.sql: asigna todos los datos existentes a tu usuario.
--
-- Datos privados por usuario: plays, song_ratings, imports, spotify_tokens, now_playing,
-- push_subscriptions, ranking_snapshots, ranking_notifications_sent, kurt_push_log, stats_*.
-- Compartido: artists, albums, tracks, song_charts (escritura solo admin).
-- Las columnas user_id quedan NULL para los datos viejos hasta correr 002.
-- ============================================================================

SET statement_timeout = 0;

-- ─── Config + perfiles + invitaciones ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  admin_email text NOT NULL
);

INSERT INTO public.app_config (id, admin_email)
VALUES (true, lower('guillejponce@gmail.com'))
ON CONFLICT (id) DO UPDATE SET admin_email = EXCLUDED.admin_email;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  avatar_url text,
  spotify_user_id text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (lower(email));

CREATE TABLE IF NOT EXISTS public.invites (
  email text PRIMARY KEY,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

-- ─── Helpers de identidad ───────────────────────────────────────────────────

-- session_user (no current_user): dentro de SECURITY DEFINER current_user es el owner.
-- PostgREST siempre conecta como `authenticator`; SQL editor y pg_cron como postgres.
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR session_user IN ('postgres', 'supabase_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin' AND pr.status = 'active'
  );
$$;

-- Usuario efectivo de una RPC: service role debe pasar p_user_id; un usuario
-- autenticado solo puede pedir sus propios datos.
CREATE OR REPLACE FUNCTION public.req_uid(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_service_role() THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id es obligatorio con service role' USING ERRCODE = '22004';
    END IF;
    RETURN p_user_id;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'cuenta no activa' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.req_uid(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.req_uid(uuid) FROM anon, public;

-- ─── Alta automática de perfil al primer login ──────────────────────────────

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
  INTO v_is_admin;
  SELECT EXISTS (SELECT 1 FROM public.invites i WHERE i.email = v_email)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── plays ──────────────────────────────────────────────────────────────────

ALTER TABLE public.plays
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.plays_track_played_at_unique;
CREATE UNIQUE INDEX IF NOT EXISTS plays_user_track_played_at_unique
  ON public.plays (user_id, track_id, played_at);

CREATE INDEX IF NOT EXISTS idx_plays_user_played_at_covering
  ON public.plays (user_id, played_at DESC)
  INCLUDE (track_id, artist_id, album_id, ms_played);

CREATE INDEX IF NOT EXISTS idx_plays_user_artist_played_at
  ON public.plays (user_id, artist_id, played_at)
  WHERE artist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plays_user_album_played_at
  ON public.plays (user_id, album_id, played_at)
  WHERE album_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plays_user_source_played_at
  ON public.plays (user_id, source, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_plays_user_chile_date
  ON public.plays (user_id, ((played_at AT TIME ZONE 'America/Santiago')::date));

-- ─── song_ratings ───────────────────────────────────────────────────────────

ALTER TABLE public.song_ratings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.song_ratings DROP CONSTRAINT IF EXISTS song_ratings_track_unique;
CREATE UNIQUE INDEX IF NOT EXISTS song_ratings_user_track_unique
  ON public.song_ratings (user_id, track_id);
CREATE INDEX IF NOT EXISTS idx_song_ratings_user_updated
  ON public.song_ratings (user_id, updated_at DESC);

-- ─── imports ────────────────────────────────────────────────────────────────

ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS user_id text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'imports'
      AND column_name = 'user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.imports ALTER COLUMN user_id DROP DEFAULT;
    ALTER TABLE public.imports ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.imports ALTER COLUMN user_id TYPE uuid USING (
      CASE
        WHEN user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN user_id::uuid
        ELSE NULL
      END
    );
    ALTER TABLE public.imports
      ADD CONSTRAINT imports_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS source_fingerprint text;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS cursor jsonb;

CREATE INDEX IF NOT EXISTS idx_imports_user_fingerprint
  ON public.imports (user_id, source_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_user_created
  ON public.imports (user_id, created_at DESC);

-- ─── spotify_tokens (id = user_id::text para nuevas filas) ──────────────────

ALTER TABLE public.spotify_tokens
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS spotify_tokens_user_unique
  ON public.spotify_tokens (user_id);
ALTER TABLE public.spotify_tokens ADD COLUMN IF NOT EXISTS scope text;

-- ─── now_playing: de singleton a una fila por usuario ───────────────────────

DROP TABLE IF EXISTS public.now_playing;
CREATE TABLE public.now_playing (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id text REFERENCES public.tracks(id),
  artist_id text REFERENCES public.artists(id),
  album_id text REFERENCES public.albums(id),
  is_playing boolean DEFAULT false,
  progress_ms integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ─── push / ranking / kurt ──────────────────────────────────────────────────

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ranking_snapshots DROP CONSTRAINT IF EXISTS ranking_snapshots_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS ranking_snapshots_user_unique
  ON public.ranking_snapshots (user_id, snapshot_date, entity_type, entity_id);
DROP INDEX IF EXISTS public.ranking_snapshots_lookup_idx;
CREATE INDEX IF NOT EXISTS ranking_snapshots_user_lookup_idx
  ON public.ranking_snapshots (user_id, entity_type, snapshot_date, rank);

ALTER TABLE public.ranking_notifications_sent
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ranking_notifications_sent'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.ranking_notifications_sent DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ranking_notifications_sent_user_unique
  ON public.ranking_notifications_sent (user_id, entity_type, entity_id, snapshot_date, kind);

ALTER TABLE public.kurt_push_log
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.kurt_push_log DROP CONSTRAINT IF EXISTS kurt_push_log_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS kurt_push_log_user_unique
  ON public.kurt_push_log (user_id, chile_day, kind);

-- ─── Rollups por usuario (se reconstruyen en 002 / al terminar cada import) ──

DROP TRIGGER IF EXISTS plays_stats_rollups_stmt ON public.plays;

DROP TABLE IF EXISTS public.stats_daily_segments;
DROP TABLE IF EXISTS public.stats_daily_hour_segments;
DROP TABLE IF EXISTS public.stats_daily_platform_segments;
DROP TABLE IF EXISTS public.stats_track_segments;
DROP TABLE IF EXISTS public.stats_artist_segments;
DROP TABLE IF EXISTS public.stats_album_segments;

CREATE TABLE public.stats_daily_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_date date NOT NULL,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket_date)
);

CREATE TABLE public.stats_daily_hour_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_date date NOT NULL,
  hour_chile smallint NOT NULL CHECK (hour_chile >= 0 AND hour_chile <= 23),
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket_date, hour_chile)
);

CREATE TABLE public.stats_daily_platform_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_date date NOT NULL,
  platform text NOT NULL,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket_date, platform)
);

CREATE TABLE public.stats_track_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id text NOT NULL,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, track_id)
);

CREATE TABLE public.stats_artist_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id text NOT NULL,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, artist_id)
);

CREATE TABLE public.stats_album_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  album_id text NOT NULL,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, album_id)
);

CREATE INDEX idx_stats_track_segments_user_count
  ON public.stats_track_segments (user_id, segment_count DESC, total_ms DESC);
CREATE INDEX idx_stats_artist_segments_user_count
  ON public.stats_artist_segments (user_id, segment_count DESC, total_ms DESC);
CREATE INDEX idx_stats_album_segments_user_count
  ON public.stats_album_segments (user_id, segment_count DESC, total_ms DESC);

DROP FUNCTION IF EXISTS public.refresh_stats_rollups_full();

CREATE OR REPLACE FUNCTION public.refresh_stats_rollups_for_user(p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);

  DELETE FROM public.stats_daily_segments WHERE user_id = v_uid;
  DELETE FROM public.stats_daily_hour_segments WHERE user_id = v_uid;
  DELETE FROM public.stats_daily_platform_segments WHERE user_id = v_uid;
  DELETE FROM public.stats_track_segments WHERE user_id = v_uid;
  DELETE FROM public.stats_artist_segments WHERE user_id = v_uid;
  DELETE FROM public.stats_album_segments WHERE user_id = v_uid;

  INSERT INTO public.stats_daily_segments (user_id, bucket_date, segment_count, total_ms)
  SELECT v_uid, (p.played_at AT TIME ZONE 'America/Santiago')::date,
         COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  WHERE p.user_id = v_uid
  GROUP BY 2;

  INSERT INTO public.stats_daily_hour_segments (user_id, bucket_date, hour_chile, segment_count, total_ms)
  SELECT v_uid, (p.played_at AT TIME ZONE 'America/Santiago')::date,
         EXTRACT(HOUR FROM (p.played_at AT TIME ZONE 'America/Santiago'))::smallint,
         COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  WHERE p.user_id = v_uid
  GROUP BY 2, 3;

  INSERT INTO public.stats_daily_platform_segments (user_id, bucket_date, platform, segment_count, total_ms)
  SELECT v_uid, (p.played_at AT TIME ZONE 'America/Santiago')::date,
         COALESCE(NULLIF(trim(BOTH FROM p.platform::text), ''), '(unknown)')::text,
         COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  WHERE p.user_id = v_uid
  GROUP BY 2, 3;

  INSERT INTO public.stats_track_segments (user_id, track_id, segment_count, total_ms)
  SELECT v_uid, p.track_id, COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  WHERE p.user_id = v_uid AND p.track_id IS NOT NULL
  GROUP BY p.track_id;

  INSERT INTO public.stats_artist_segments (user_id, artist_id, segment_count, total_ms)
  SELECT v_uid, COALESCE(p.artist_id, tr.artist_id),
         COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  LEFT JOIN public.tracks tr ON tr.id = p.track_id
  WHERE p.user_id = v_uid AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
  GROUP BY 2;

  INSERT INTO public.stats_album_segments (user_id, album_id, segment_count, total_ms)
  SELECT v_uid, COALESCE(p.album_id, tr.album_id),
         COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  LEFT JOIN public.tracks tr ON tr.id = p.track_id
  WHERE p.user_id = v_uid AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
  GROUP BY 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_stats_rollups_for_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.refresh_stats_rollups_for_user(uuid) TO authenticated, service_role;

-- Trigger incremental: solo filas realmente insertadas (ON CONFLICT DO NOTHING no las incluye).
CREATE OR REPLACE FUNCTION public.stats_rollups_after_plays_insert_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM new_rows WHERE user_id IS NOT NULL LIMIT 1) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.stats_daily_segments (user_id, bucket_date, segment_count, total_ms)
  SELECT nr.user_id, (nr.played_at AT TIME ZONE 'America/Santiago')::date,
         COUNT(*)::bigint, COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  WHERE nr.user_id IS NOT NULL
  GROUP BY 1, 2
  ON CONFLICT (user_id, bucket_date) DO UPDATE SET
    segment_count = public.stats_daily_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_daily_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_daily_hour_segments (user_id, bucket_date, hour_chile, segment_count, total_ms)
  SELECT nr.user_id, (nr.played_at AT TIME ZONE 'America/Santiago')::date,
         EXTRACT(HOUR FROM (nr.played_at AT TIME ZONE 'America/Santiago'))::smallint,
         COUNT(*)::bigint, COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  WHERE nr.user_id IS NOT NULL
  GROUP BY 1, 2, 3
  ON CONFLICT (user_id, bucket_date, hour_chile) DO UPDATE SET
    segment_count = public.stats_daily_hour_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_daily_hour_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_daily_platform_segments (user_id, bucket_date, platform, segment_count, total_ms)
  SELECT nr.user_id, (nr.played_at AT TIME ZONE 'America/Santiago')::date,
         COALESCE(NULLIF(trim(BOTH FROM nr.platform::text), ''), '(unknown)')::text,
         COUNT(*)::bigint, COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  WHERE nr.user_id IS NOT NULL
  GROUP BY 1, 2, 3
  ON CONFLICT (user_id, bucket_date, platform) DO UPDATE SET
    segment_count = public.stats_daily_platform_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_daily_platform_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_track_segments (user_id, track_id, segment_count, total_ms)
  SELECT nr.user_id, nr.track_id, COUNT(*)::bigint, COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  WHERE nr.user_id IS NOT NULL AND nr.track_id IS NOT NULL
  GROUP BY 1, 2
  ON CONFLICT (user_id, track_id) DO UPDATE SET
    segment_count = public.stats_track_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_track_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_artist_segments (user_id, artist_id, segment_count, total_ms)
  SELECT nr.user_id, COALESCE(nr.artist_id, tr.artist_id),
         COUNT(*)::bigint, COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  LEFT JOIN public.tracks tr ON tr.id = nr.track_id
  WHERE nr.user_id IS NOT NULL AND COALESCE(nr.artist_id, tr.artist_id) IS NOT NULL
  GROUP BY 1, 2
  ON CONFLICT (user_id, artist_id) DO UPDATE SET
    segment_count = public.stats_artist_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_artist_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_album_segments (user_id, album_id, segment_count, total_ms)
  SELECT nr.user_id, COALESCE(nr.album_id, tr.album_id),
         COUNT(*)::bigint, COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  LEFT JOIN public.tracks tr ON tr.id = nr.track_id
  WHERE nr.user_id IS NOT NULL AND COALESCE(nr.album_id, tr.album_id) IS NOT NULL
  GROUP BY 1, 2
  ON CONFLICT (user_id, album_id) DO UPDATE SET
    segment_count = public.stats_album_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_album_segments.total_ms + EXCLUDED.total_ms;

  RETURN NULL;
END;
$$;

CREATE TRIGGER plays_stats_rollups_stmt
AFTER INSERT ON public.plays
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.stats_rollups_after_plays_insert_stmt();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- El servidor usa service role (bypassa RLS) y filtra por user_id explícitamente.
-- Estas políticas cubren cualquier acceso directo con la publishable key + sesión.

DROP POLICY IF EXISTS kurt_push_log_personal ON public.kurt_push_log;
DROP POLICY IF EXISTS push_subscriptions_personal ON public.push_subscriptions;
DROP POLICY IF EXISTS ranking_snapshots_personal ON public.ranking_snapshots;
DROP POLICY IF EXISTS ranking_notifications_sent_personal ON public.ranking_notifications_sent;
DROP POLICY IF EXISTS song_charts_personal ON public.song_charts;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'plays', 'song_ratings', 'imports', 'now_playing', 'push_subscriptions',
    'ranking_snapshots', 'ranking_notifications_sent', 'kurt_push_log',
    'stats_daily_segments', 'stats_daily_hour_segments', 'stats_daily_platform_segments',
    'stats_track_segments', 'stats_artist_segments', 'stats_album_segments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_user())) '
      'WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_user()))',
      t || '_owner', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Tokens: nunca expuestos fuera del servidor.
ALTER TABLE public.spotify_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spotify_tokens FROM anon, authenticated;
GRANT ALL ON public.spotify_tokens TO service_role;

-- Perfiles: cada uno ve el suyo; el admin ve todos. Escrituras solo desde el servidor.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
DROP POLICY IF EXISTS profiles_self_or_admin ON public.profiles;
CREATE POLICY profiles_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invites FROM anon;
GRANT SELECT ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;
DROP POLICY IF EXISTS invites_admin ON public.invites;
CREATE POLICY invites_admin ON public.invites
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- Catálogo compartido: lectura para usuarios activos, escritura solo servidor.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['artists', 'albums', 'tracks']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING ((SELECT public.is_active_user()))',
      t || '_read', t
    );
  END LOOP;
END $$;

-- Cancionero compartido: todos leen, solo el admin escribe.
ALTER TABLE public.song_charts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.song_charts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_charts TO authenticated;
GRANT ALL ON public.song_charts TO service_role;
DROP POLICY IF EXISTS song_charts_read ON public.song_charts;
CREATE POLICY song_charts_read ON public.song_charts
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user()));
DROP POLICY IF EXISTS song_charts_admin_write ON public.song_charts;
CREATE POLICY song_charts_admin_write ON public.song_charts
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
