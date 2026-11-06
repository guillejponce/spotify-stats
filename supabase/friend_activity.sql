-- ============================================================================
-- FRIEND ACTIVITY FEED
-- Feed de actividad musical de amigos
-- ============================================================================

-- 1) TABLA: Activity events
CREATE TABLE IF NOT EXISTS friend_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'new_rating',
    'discovered_artist', 
    'discovered_track',
    'listening_streak',
    'top_track_changed',
    'big_milestone'
  )),
  event_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friend_activity_events_user_idx 
  ON friend_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS friend_activity_events_created_idx 
  ON friend_activity_events(created_at DESC);

-- 2) FUNCIÓN: Get friend activity feed
CREATE OR REPLACE FUNCTION get_friend_activity_feed(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  activity_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  event_type text,
  event_data jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Obtener actividad de amigos aceptados
  RETURN QUERY
  SELECT
    fae.id,
    fae.user_id,
    p.display_name,
    p.avatar_url,
    fae.event_type,
    fae.event_data,
    fae.created_at
  FROM friend_activity_events fae
  INNER JOIN profiles p ON p.id = fae.user_id
  WHERE fae.user_id IN (
    -- Amigos aceptados
    SELECT CASE 
      WHEN f.requester_id = p_user_id THEN f.addressee_id
      ELSE f.requester_id
    END
    FROM friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
  )
  ORDER BY fae.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3) FUNCIÓN: Detectar y crear evento de rating
CREATE OR REPLACE FUNCTION trigger_rating_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo crear evento para ratings altos (8+)
  IF NEW.rating >= 8 THEN
    INSERT INTO friend_activity_events (user_id, event_type, event_data)
    SELECT
      NEW.user_id,
      'new_rating',
      jsonb_build_object(
        'track_id', t.id,
        'track_name', t.name,
        'artist_name', a.name,
        'artist_id', a.id,
        'rating', NEW.rating,
        'album_image', alb.image_url
      )
    FROM tracks t
    INNER JOIN artists a ON a.id = t.artist_id
    LEFT JOIN albums alb ON alb.id = t.album_id
    WHERE t.id = NEW.track_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para ratings
DROP TRIGGER IF EXISTS song_ratings_activity_trigger ON song_ratings;
CREATE TRIGGER song_ratings_activity_trigger
  AFTER INSERT ON song_ratings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_rating_activity();

-- 4) FUNCIÓN: Detectar descubrimiento de artista
CREATE OR REPLACE FUNCTION detect_artist_discovery(
  p_user_id uuid,
  p_artist_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_play timestamptz;
  v_play_count integer;
  v_is_new boolean;
BEGIN
  -- Obtener primera escucha y count total
  SELECT MIN(played_at), COUNT(*)
  INTO v_first_play, v_play_count
  FROM plays
  WHERE user_id = p_user_id
    AND artist_id = p_artist_id;
  
  -- Es descubrimiento si es reciente (últimas 48h) y pocas escuchas (< 10)
  v_is_new := (v_first_play > now() - interval '48 hours' AND v_play_count < 10);
  
  IF v_is_new THEN
    -- Crear evento de descubrimiento
    INSERT INTO friend_activity_events (user_id, event_type, event_data)
    SELECT
      p_user_id,
      'discovered_artist',
      jsonb_build_object(
        'artist_id', a.id,
        'artist_name', a.name,
        'artist_image', a.image_url,
        'first_played', v_first_play
      )
    FROM artists a
    WHERE a.id = p_artist_id
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN v_is_new;
END;
$$;

-- 5) FUNCIÓN: Detectar rachas de escucha
CREATE OR REPLACE FUNCTION check_listening_streak(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_streak integer := 0;
  v_date date;
  v_has_plays boolean;
BEGIN
  -- Contar días consecutivos con plays (hacia atrás desde hoy)
  FOR v_date IN 
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE - interval '365 days', '-1 day'::interval)::date
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM plays
      WHERE user_id = p_user_id
        AND DATE(played_at AT TIME ZONE 'America/Santiago') = v_date
        AND ms_played >= 30000
    ) INTO v_has_plays;
    
    IF v_has_plays THEN
      v_current_streak := v_current_streak + 1;
    ELSE
      EXIT; -- Racha rota
    END IF;
  END LOOP;
  
  -- Si la racha es múltiplo de 7 o mayor a 30, crear evento
  IF v_current_streak > 0 AND (v_current_streak % 7 = 0 OR v_current_streak >= 30) THEN
    INSERT INTO friend_activity_events (user_id, event_type, event_data)
    VALUES (
      p_user_id,
      'listening_streak',
      jsonb_build_object(
        'days', v_current_streak,
        'milestone', CASE
          WHEN v_current_streak >= 100 THEN 'legendary'
          WHEN v_current_streak >= 50 THEN 'impressive'
          WHEN v_current_streak >= 30 THEN 'strong'
          ELSE 'building'
        END
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN jsonb_build_object('current_streak', v_current_streak);
END;
$$;

-- 6) Row Level Security
ALTER TABLE friend_activity_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON friend_activity_events TO service_role;

-- Comentarios
COMMENT ON TABLE friend_activity_events IS 'Eventos de actividad musical de usuarios para feed social';
COMMENT ON FUNCTION get_friend_activity_feed IS 'Feed de actividad de amigos aceptados';
COMMENT ON FUNCTION detect_artist_discovery IS 'Detectar y registrar descubrimiento de nuevo artista';
COMMENT ON FUNCTION check_listening_streak IS 'Calcular racha actual de días consecutivos escuchando';

REVOKE EXECUTE ON FUNCTION public.get_friend_activity_feed(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_rating_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_artist_discovery(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_listening_streak(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_rating_activity() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_artist_discovery(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_listening_streak(uuid) TO service_role;
