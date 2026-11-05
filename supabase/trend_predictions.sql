-- ============================================================================
-- TREND PREDICTIONS: Next Big Thing Predictor
-- Detecta artistas/tracks con tendencia ascendente
-- ============================================================================

-- 1) FUNCIÓN: Detectar trending artists (aceleración reciente)
CREATE OR REPLACE FUNCTION get_trending_artists(
  p_user_id uuid,
  p_limit integer DEFAULT 5
) RETURNS TABLE (
  artist_id text,
  artist_name text,
  artist_image text,
  current_period_plays integer,
  previous_period_plays integer,
  growth_rate float,
  trend_score float,
  prediction text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_days integer := 30; -- comparar últimos 30 días vs anteriores 30
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT
      p.artist_id,
      COUNT(*)::integer as plays
    FROM plays p
    WHERE p.user_id = p_user_id
      AND p.played_at >= now() - (v_period_days || ' days')::interval
      AND p.ms_played >= 30000
    GROUP BY p.artist_id
  ),
  previous_period AS (
    SELECT
      p.artist_id,
      COUNT(*)::integer as plays
    FROM plays p
    WHERE p.user_id = p_user_id
      AND p.played_at >= now() - (v_period_days * 2 || ' days')::interval
      AND p.played_at < now() - (v_period_days || ' days')::interval
      AND p.ms_played >= 30000
    GROUP BY p.artist_id
  ),
  trends AS (
    SELECT
      COALESCE(cp.artist_id, pp.artist_id) as artist_id,
      COALESCE(cp.plays, 0) as current_plays,
      COALESCE(pp.plays, 0) as previous_plays,
      -- Growth rate (% change)
      CASE 
        WHEN COALESCE(pp.plays, 0) = 0 THEN 999.0 -- new discovery
        ELSE ((cp.plays::float - pp.plays::float) / pp.plays::float) * 100
      END as growth_rate,
      -- Trend score: combina growth rate + volume actual
      (
        CASE 
          WHEN COALESCE(pp.plays, 0) = 0 THEN 10.0
          ELSE ((cp.plays::float - pp.plays::float) / pp.plays::float)
        END * 
        SQRT(COALESCE(cp.plays, 0)::float)
      ) as trend_score
    FROM current_period cp
    FULL OUTER JOIN previous_period pp ON pp.artist_id = cp.artist_id
    WHERE COALESCE(cp.plays, 0) >= 3 -- mínimo 3 plays en período actual
  )
  SELECT
    t.artist_id,
    a.name,
    a.image_url,
    t.current_plays,
    t.previous_plays,
    t.growth_rate,
    t.trend_score,
    CASE
      WHEN t.growth_rate >= 200 THEN 'Obsesión nueva detectada 🔥'
      WHEN t.growth_rate >= 100 THEN 'En camino a tu top 10'
      WHEN t.growth_rate >= 50 THEN 'Tendencia alcista fuerte'
      WHEN t.growth_rate >= 20 THEN 'Creciendo consistentemente'
      ELSE 'En tu radar'
    END as prediction
  FROM trends t
  INNER JOIN artists a ON a.id = t.artist_id
  WHERE t.growth_rate > 0 -- solo crecimiento positivo
  ORDER BY t.trend_score DESC
  LIMIT p_limit;
END;
$$;

-- 2) FUNCIÓN: Detectar trending tracks
CREATE OR REPLACE FUNCTION get_trending_tracks(
  p_user_id uuid,
  p_limit integer DEFAULT 5
) RETURNS TABLE (
  track_id text,
  track_name text,
  artist_name text,
  album_image text,
  current_period_plays integer,
  previous_period_plays integer,
  growth_rate float,
  prediction text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_days integer := 14; -- ventana más corta para tracks
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT
      p.track_id,
      COUNT(*)::integer as plays
    FROM plays p
    WHERE p.user_id = p_user_id
      AND p.played_at >= now() - (v_period_days || ' days')::interval
      AND p.ms_played >= 30000
    GROUP BY p.track_id
  ),
  previous_period AS (
    SELECT
      p.track_id,
      COUNT(*)::integer as plays
    FROM plays p
    WHERE p.user_id = p_user_id
      AND p.played_at >= now() - (v_period_days * 2 || ' days')::interval
      AND p.played_at < now() - (v_period_days || ' days')::interval
      AND p.ms_played >= 30000
    GROUP BY p.track_id
  ),
  trends AS (
    SELECT
      COALESCE(cp.track_id, pp.track_id) as track_id,
      COALESCE(cp.plays, 0) as current_plays,
      COALESCE(pp.plays, 0) as previous_plays,
      CASE 
        WHEN COALESCE(pp.plays, 0) = 0 THEN 999.0
        ELSE ((cp.plays::float - pp.plays::float) / pp.plays::float) * 100
      END as growth_rate
    FROM current_period cp
    FULL OUTER JOIN previous_period pp ON pp.track_id = cp.track_id
    WHERE COALESCE(cp.plays, 0) >= 2
  )
  SELECT
    t.track_id,
    tr.name,
    a.name,
    alb.image_url,
    t.current_plays,
    t.previous_plays,
    t.growth_rate,
    CASE
      WHEN t.growth_rate >= 300 THEN 'Tu nueva obsesión'
      WHEN t.growth_rate >= 150 THEN 'No puedes parar de escucharla'
      WHEN t.growth_rate >= 75 THEN 'Subiendo rápido'
      ELSE 'En ascenso'
    END as prediction
  FROM trends t
  INNER JOIN tracks tr ON tr.id = t.track_id
  INNER JOIN artists a ON a.id = tr.artist_id
  LEFT JOIN albums alb ON alb.id = tr.album_id
  WHERE t.growth_rate > 0
  ORDER BY t.growth_rate DESC, t.current_plays DESC
  LIMIT p_limit;
END;
$$;

-- 3) FUNCIÓN: Predecir ranking futuro
CREATE OR REPLACE FUNCTION predict_future_ranking(
  p_user_id uuid,
  p_entity_type text, -- 'artist' | 'track'
  p_entity_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_rank integer;
  v_trend_data jsonb;
  v_prediction jsonb;
BEGIN
  -- Obtener trend data según el tipo
  IF p_entity_type = 'artist' THEN
    SELECT jsonb_build_object(
      'current_plays', current_period_plays,
      'previous_plays', previous_period_plays,
      'growth_rate', growth_rate,
      'prediction', prediction
    )
    INTO v_trend_data
    FROM get_trending_artists(p_user_id, 100)
    WHERE artist_id = p_entity_id;
    
    -- Obtener ranking actual
    SELECT rank_num INTO v_current_rank
    FROM (
      SELECT 
        artist_id,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank_num
      FROM plays
      WHERE user_id = p_user_id
        AND played_at >= now() - interval '30 days'
        AND ms_played >= 30000
      GROUP BY artist_id
    ) ranks
    WHERE artist_id = p_entity_id;
    
  ELSIF p_entity_type = 'track' THEN
    SELECT jsonb_build_object(
      'current_plays', current_period_plays,
      'previous_plays', previous_period_plays,
      'growth_rate', growth_rate,
      'prediction', prediction
    )
    INTO v_trend_data
    FROM get_trending_tracks(p_user_id, 100)
    WHERE track_id = p_entity_id;
    
    -- Obtener ranking actual
    SELECT rank_num INTO v_current_rank
    FROM (
      SELECT 
        track_id,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank_num
      FROM plays
      WHERE user_id = p_user_id
        AND played_at >= now() - interval '14 days'
        AND ms_played >= 30000
      GROUP BY track_id
    ) ranks
    WHERE track_id = p_entity_id;
  END IF;
  
  -- Construir predicción
  IF v_trend_data IS NOT NULL THEN
    v_prediction := jsonb_build_object(
      'current_rank', v_current_rank,
      'trend_data', v_trend_data,
      'is_trending', true
    );
  ELSE
    v_prediction := jsonb_build_object(
      'current_rank', v_current_rank,
      'is_trending', false,
      'message', 'No significant trend detected'
    );
  END IF;
  
  RETURN v_prediction;
END;
$$;

-- 4) FUNCIÓN: Get comprehensive trends dashboard
CREATE OR REPLACE FUNCTION get_trends_dashboard(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trending_artists jsonb;
  v_trending_tracks jsonb;
  v_discovery_rate jsonb;
BEGIN
  -- Top trending artists
  SELECT jsonb_agg(row_to_json(t))
  INTO v_trending_artists
  FROM get_trending_artists(p_user_id, 3) t;
  
  -- Top trending tracks
  SELECT jsonb_agg(row_to_json(t))
  INTO v_trending_tracks
  FROM get_trending_tracks(p_user_id, 3) t;
  
  -- Discovery rate (nuevos artistas últimos 30 días)
  SELECT jsonb_build_object(
    'new_artists_count', COUNT(DISTINCT artist_id),
    'new_tracks_count', COUNT(DISTINCT track_id)
  )
  INTO v_discovery_rate
  FROM (
    SELECT DISTINCT p.artist_id, p.track_id
    FROM plays p
    WHERE p.user_id = p_user_id
      AND p.played_at >= now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM plays p2
        WHERE p2.user_id = p_user_id
          AND p2.artist_id = p.artist_id
          AND p2.played_at < now() - interval '30 days'
      )
  ) discoveries;
  
  RETURN jsonb_build_object(
    'trending_artists', COALESCE(v_trending_artists, '[]'::jsonb),
    'trending_tracks', COALESCE(v_trending_tracks, '[]'::jsonb),
    'discovery_rate', v_discovery_rate,
    'updated_at', now()
  );
END;
$$;

-- Comentarios
COMMENT ON FUNCTION get_trending_artists IS 'Detectar artistas con mayor aceleración en escuchas';
COMMENT ON FUNCTION get_trending_tracks IS 'Detectar tracks con mayor aceleración en escuchas';
COMMENT ON FUNCTION predict_future_ranking IS 'Predecir ranking futuro basado en tendencia actual';
COMMENT ON FUNCTION get_trends_dashboard IS 'Dashboard completo de tendencias y descubrimientos';
