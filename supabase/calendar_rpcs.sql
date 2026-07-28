-- Calendario Musical: "On This Day" / "On This Month" memories
-- Ejecutar después de base_script.sql

-- Returns years that have listening data (for the year wheel)
CREATE OR REPLACE FUNCTION public.get_calendar_available_years()
RETURNS TABLE (year integer, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR FROM played_at AT TIME ZONE 'America/Santiago')::integer AS year,
    COUNT(*)::bigint AS play_count
  FROM plays
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_available_years()
  TO anon, authenticated, service_role;

-- Main memories function: returns JSONB bundle with summary + top tracks/artists/albums
-- target_day = 0 → whole month; target_day > 0 → specific day
CREATE OR REPLACE FUNCTION public.get_calendar_memories(
  target_year integer,
  target_month integer,
  target_day integer DEFAULT 0,
  result_limit integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  period_start timestamptz;
  period_end   timestamptz;
  v_summary    jsonb;
  v_tracks     jsonb;
  v_artists    jsonb;
  v_albums     jsonb;
BEGIN
  IF target_day > 0 THEN
    period_start := make_timestamptz(
      target_year, target_month, target_day, 0, 0, 0, 'America/Santiago'
    );
    period_end := period_start + interval '1 day';
  ELSE
    period_start := make_timestamptz(
      target_year, target_month, 1, 0, 0, 0, 'America/Santiago'
    );
    IF target_month = 12 THEN
      period_end := make_timestamptz(
        target_year + 1, 1, 1, 0, 0, 0, 'America/Santiago'
      );
    ELSE
      period_end := make_timestamptz(
        target_year, target_month + 1, 1, 0, 0, 0, 'America/Santiago'
      );
    END IF;
  END IF;

  -- Summary (join tracks to count artists reliably even when plays.artist_id is NULL)
  SELECT jsonb_build_object(
    'play_count',     COUNT(*)::bigint,
    'total_ms',       COALESCE(SUM(p.ms_played), 0)::bigint,
    'unique_tracks',  COUNT(DISTINCT p.track_id)::bigint,
    'unique_artists', COUNT(DISTINCT tr.artist_id)::bigint
  )
  INTO v_summary
  FROM plays p
  LEFT JOIN tracks tr ON tr.id = p.track_id
  WHERE p.played_at >= period_start AND p.played_at < period_end;

  -- Top tracks
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_tracks
  FROM (
    SELECT
      tr.id,
      tr.name,
      COALESCE(al.image_url, ar.image_url) AS image_url,
      ar.name  AS artist_name,
      tr.spotify_url,
      COUNT(*)::bigint                     AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    JOIN tracks  tr ON tr.id = p.track_id
    LEFT JOIN albums  al ON al.id = tr.album_id
    LEFT JOIN artists ar ON ar.id = tr.artist_id
    WHERE p.played_at >= period_start
      AND p.played_at < period_end
      AND p.track_id IS NOT NULL
    GROUP BY tr.id, tr.name, al.image_url, ar.image_url, ar.name, tr.spotify_url
    ORDER BY COUNT(*) DESC, SUM(p.ms_played) DESC, tr.name ASC
    LIMIT greatest(least(result_limit, 50), 1)
  ) t;

  -- Top artists (join through tracks so plays with NULL artist_id still resolve)
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb)
  INTO v_artists
  FROM (
    SELECT
      ar.id,
      ar.name,
      COALESCE(
        ar.image_url,
        (
          SELECT al2.image_url
          FROM public.plays p2
          INNER JOIN public.tracks t2 ON t2.id = p2.track_id
          INNER JOIN public.albums al2 ON al2.id = t2.album_id
          WHERE COALESCE(p2.artist_id, t2.artist_id) = ar.id
            AND al2.image_url IS NOT NULL
          ORDER BY p2.played_at DESC
          LIMIT 1
        ),
        (
          SELECT al3.image_url
          FROM public.albums al3
          WHERE al3.artist_id = ar.id
            AND al3.image_url IS NOT NULL
          LIMIT 1
        )
      ) AS image_url,
      ar.spotify_url,
      COUNT(*)::bigint                     AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    JOIN tracks  tr ON tr.id = p.track_id
    JOIN artists ar ON ar.id = tr.artist_id
    WHERE p.played_at >= period_start
      AND p.played_at < period_end
      AND p.track_id IS NOT NULL
      AND tr.artist_id IS NOT NULL
    GROUP BY ar.id, ar.name, ar.image_url, ar.spotify_url
    ORDER BY COUNT(*) DESC, SUM(p.ms_played) DESC, ar.name ASC
    LIMIT greatest(least(result_limit, 50), 1)
  ) a;

  -- Top albums
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb)
  INTO v_albums
  FROM (
    SELECT
      al.id,
      al.name,
      al.image_url,
      ar.name  AS artist_name,
      al.spotify_url,
      COUNT(*)::bigint                     AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    JOIN tracks  tr ON tr.id = p.track_id
    JOIN albums  al ON al.id = tr.album_id
    LEFT JOIN artists ar ON ar.id = tr.artist_id
    WHERE p.played_at >= period_start
      AND p.played_at < period_end
      AND tr.album_id IS NOT NULL
    GROUP BY al.id, al.name, al.image_url, ar.name, al.spotify_url
    ORDER BY COUNT(*) DESC, SUM(p.ms_played) DESC, al.name ASC
    LIMIT greatest(least(result_limit, 50), 1)
  ) a;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'tracks',  v_tracks,
    'artists', v_artists,
    'albums',  v_albums
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_memories(integer, integer, integer, integer)
  TO anon, authenticated, service_role;
