-- Stats RPCs for the dashboard (/api/stats → src/lib/stats.ts).
-- Bucketing for heatmap, hourly, and "listening over time" uses America/Santiago (Chile local).
-- Si ves un día de más (p. ej. "lunes" un domingo por la noche): volvé a aplicar este archivo
-- para reemplazar las funciones, y desplegá el backend con `chile-stats-range` (rangos de filtro).
-- Run once in Supabase SQL Editor after `plays`, `tracks`, `artists`, `albums` exist.

-- Spotify exporta una fila por *segmento* de escucha: pausar y reanudar suele generar varias filas
-- para el mismo tema. Para los rankings top, agrupamos segmentos en *sesiones* (mismo track_id,
-- hueco máx. configurable). El KPI «Total» del dashboard usa COUNT(*) de filas (segmentos),
-- coherente con las gráficas de período/hora/plataforma; las listas Top siguen en sesiones.
CREATE OR REPLACE FUNCTION public.plays_in_range_with_sessions(
  start_date timestamptz,
  end_date timestamptz,
  max_gap interval DEFAULT INTERVAL '15 minutes'
)
RETURNS TABLE (
  play_id uuid,
  track_id text,
  artist_id text,
  album_id text,
  played_at timestamptz,
  ms_played bigint,
  session_id bigint,
  is_session_start boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      p.id AS bid,
      p.track_id AS tid,
      COALESCE(p.artist_id, tr.artist_id) AS aid,
      COALESCE(p.album_id, tr.album_id) AS albid,
      p.played_at AS pat,
      p.ms_played::bigint AS msp
    FROM plays p
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
  ),
  marked AS (
    SELECT b.*,
      CASE
        WHEN lag(b.pat) OVER (PARTITION BY b.tid ORDER BY b.pat) IS NULL THEN 1
        WHEN b.pat - lag(b.pat) OVER (PARTITION BY b.tid ORDER BY b.pat) > max_gap THEN 1
        ELSE 0
      END::integer AS new_s
    FROM base b
  ),
  keyed AS (
    SELECT m.*,
      SUM(m.new_s) OVER (PARTITION BY m.tid ORDER BY m.pat)::bigint AS sid
    FROM marked m
  )
  SELECT k.bid AS play_id,
         k.tid AS track_id,
         k.aid AS artist_id,
         k.albid AS album_id,
         k.pat AS played_at,
         k.msp AS ms_played,
         k.sid AS session_id,
         (k.new_s = 1) AS is_session_start
  FROM keyed k;
$$;


-- Al agregar `session_count`, el tipo OUT cambia: hace falta DROP antes de crear.
DROP FUNCTION IF EXISTS public.get_total_listening_time(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_total_listening_time(
  start_date timestamptz,
  end_date timestamptz
)
RETURNS TABLE (total_ms bigint, play_count bigint, session_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (
        SELECT SUM(p.ms_played)::bigint
        FROM plays p
        WHERE p.played_at >= start_date AND p.played_at <= end_date
      ),
      0
    ) AS total_ms,
    COALESCE(
      (
        SELECT COUNT(*)::bigint
        FROM plays p
        WHERE p.played_at >= start_date AND p.played_at <= end_date
      ),
      0
    ) AS play_count,
    (
      COALESCE(
        (
          SELECT COUNT(*)::bigint
          FROM (
            SELECT DISTINCT s.track_id, s.session_id
            FROM public.plays_in_range_with_sessions(start_date, end_date) s
          ) x
        ),
        0
      )
      + COALESCE(
        (
          SELECT COUNT(*)::bigint
          FROM plays p
          WHERE p.played_at >= start_date
            AND p.played_at <= end_date
            AND p.track_id IS NULL
        ),
        0
      )
    ) AS session_count;
$$;


CREATE OR REPLACE FUNCTION public.get_top_tracks(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH agg AS (
    SELECT s.track_id,
           COUNT(DISTINCT s.session_id)::bigint AS play_count,
           COALESCE(SUM(s.ms_played), 0)::bigint AS total_ms_played
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    GROUP BY s.track_id
  )
  SELECT tr.id AS id,
         tr.name AS name,
         COALESCE(al.image_url, ar.image_url) AS image_url,
         a.play_count,
         a.total_ms_played
  FROM agg a
  INNER JOIN tracks tr ON tr.id = a.track_id
  LEFT JOIN albums al ON al.id = tr.album_id
  LEFT JOIN artists ar ON ar.id = tr.artist_id
  ORDER BY a.play_count DESC, tr.name ASC
  LIMIT result_limit;
$$;


CREATE OR REPLACE FUNCTION public.get_top_artists(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT s.artist_id,
           s.track_id,
           s.session_id,
           SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    WHERE s.artist_id IS NOT NULL
    GROUP BY s.artist_id, s.track_id, s.session_id
  ),
  joined AS (
    SELECT ps.artist_id,
           ps.session_ms,
           ar.name AS ar_name,
           ar.image_url AS ar_img,
           cover.fallback_img
    FROM per_session ps
    INNER JOIN artists ar ON ar.id = ps.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM albums al2
      WHERE al2.artist_id = ar.id
        AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
  )
  SELECT j.artist_id AS id,
         j.ar_name AS name,
         COALESCE(j.ar_img, j.fallback_img) AS image_url,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(j.session_ms), 0)::bigint AS total_ms_played
  FROM joined j
  GROUP BY j.artist_id, j.ar_name, COALESCE(j.ar_img, j.fallback_img)
  ORDER BY play_count DESC, total_ms_played DESC, j.ar_name ASC
  LIMIT result_limit;
$$;


CREATE OR REPLACE FUNCTION public.get_top_albums(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT s.album_id,
           s.track_id,
           s.session_id,
           SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    WHERE s.album_id IS NOT NULL
    GROUP BY s.album_id, s.track_id, s.session_id
  )
  SELECT ab.id AS id,
         ab.name AS name,
         ab.image_url,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(per_session.session_ms), 0)::bigint AS total_ms_played
  FROM per_session
  INNER JOIN albums ab ON ab.id = per_session.album_id
  GROUP BY ab.id, ab.name, ab.image_url
  ORDER BY play_count DESC, total_ms_played DESC, ab.name ASC
  LIMIT result_limit;
$$;


CREATE OR REPLACE FUNCTION public.get_listening_over_time(
  start_date timestamptz,
  end_date timestamptz,
  group_by text DEFAULT 'day'
)
RETURNS TABLE (date text, ms_played bigint, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH granular AS (
    SELECT
      date_trunc(
        CASE lower(coalesce(group_by, 'day'))
          WHEN 'week' THEN 'week'::text
          WHEN 'month' THEN 'month'::text
          ELSE 'day'::text
        END,
        (plays.played_at AT TIME ZONE 'America/Santiago')
      ) AS chile_bucket,
      plays.ms_played
    FROM plays
    WHERE plays.played_at >= start_date AND plays.played_at <= end_date
  )
  SELECT to_char(granular.chile_bucket, 'YYYY-MM-DD') AS date,
         SUM(granular.ms_played)::bigint AS ms_played,
         COUNT(*)::bigint AS play_count
  FROM granular
  GROUP BY granular.chile_bucket
  ORDER BY granular.chile_bucket ASC;
$$;


CREATE OR REPLACE FUNCTION public.get_hourly_distribution(
  start_date timestamptz,
  end_date timestamptz
)
RETURNS TABLE (hour integer, ms_played bigint, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
      EXTRACT(
        HOUR FROM (plays.played_at AT TIME ZONE 'America/Santiago')
      )
    )::integer AS hour,
    COALESCE(SUM(plays.ms_played), 0)::bigint AS ms_played,
    COUNT(*)::bigint AS play_count
  FROM plays
  WHERE plays.played_at >= start_date AND plays.played_at <= end_date
  GROUP BY EXTRACT(
    HOUR FROM (plays.played_at AT TIME ZONE 'America/Santiago')
  )
  ORDER BY 1 ASC;
$$;


CREATE OR REPLACE FUNCTION public.get_platform_breakdown(
  start_date timestamptz,
  end_date timestamptz
)
RETURNS TABLE (platform text, play_count bigint, ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(trim(BOTH FROM p.platform::text), ''), '(unknown)')::text AS platform,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played
  FROM plays p
  WHERE p.played_at >= start_date AND p.played_at <= end_date
  GROUP BY COALESCE(NULLIF(trim(BOTH FROM p.platform::text), ''), '(unknown)')
  ORDER BY ms_played DESC;
$$;


CREATE OR REPLACE FUNCTION public.get_heatmap_data(target_year integer)
RETURNS TABLE (date text, count bigint, ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (p.played_at AT TIME ZONE 'America/Santiago')::date::text AS date,
         COUNT(*)::bigint AS count,
         COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played
  FROM plays p
  WHERE EXTRACT(
          YEAR FROM (p.played_at AT TIME ZONE 'America/Santiago')
        )::integer = target_year
  GROUP BY (p.played_at AT TIME ZONE 'America/Santiago')::date
  ORDER BY date;
$$;


GRANT EXECUTE ON FUNCTION public.plays_in_range_with_sessions(
  timestamptz, timestamptz, interval
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_total_listening_time(timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_tracks(timestamptz, timestamptz, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_artists(timestamptz, timestamptz, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_albums(timestamptz, timestamptz, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_listening_over_time(timestamptz, timestamptz, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hourly_distribution(timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_breakdown(timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_heatmap_data(integer) TO anon, authenticated, service_role;
