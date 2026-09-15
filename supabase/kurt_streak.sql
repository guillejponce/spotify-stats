-- Racha de Kurt CubAIn + log de pushes (evitar spam).
-- Ejecutar en Supabase SQL editor. RLS permisivo: app personal.

CREATE TABLE IF NOT EXISTS public.kurt_push_log (
  chile_day date NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('nudge_day', 'threat_evening', 'last_chance', 'streak_died', 'milestone', 'test')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chile_day, kind)
);

ALTER TABLE public.kurt_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kurt_push_log_personal ON public.kurt_push_log;
CREATE POLICY kurt_push_log_personal ON public.kurt_push_log
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.kurt_push_log TO anon, authenticated, service_role;

-- Push: sin policy, RLS bloquea la publishable key (por eso fallaba el toggle).
DROP POLICY IF EXISTS push_subscriptions_personal ON public.push_subscriptions;
CREATE POLICY push_subscriptions_personal ON public.push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.push_subscriptions TO anon, authenticated, service_role;

DROP POLICY IF EXISTS ranking_snapshots_personal ON public.ranking_snapshots;
CREATE POLICY ranking_snapshots_personal ON public.ranking_snapshots
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ranking_notifications_sent_personal ON public.ranking_notifications_sent;
CREATE POLICY ranking_notifications_sent_personal ON public.ranking_notifications_sent
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.ranking_snapshots TO anon, authenticated, service_role;
GRANT ALL ON public.ranking_notifications_sent TO anon, authenticated, service_role;

-- OJO: PostgREST recorta RPCs tabulares a 1000 filas. ORDER BY d ASC
-- devolvía 2015–2020 y Kurt creía que no escuchabas desde 2020.
CREATE OR REPLACE FUNCTION public.get_listen_days()
RETURNS TABLE (d date, play_count bigint, total_ms bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (p.played_at AT TIME ZONE 'America/Santiago')::date AS d,
    COUNT(*)::bigint AS play_count,
    COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms
  FROM plays p
  WHERE p.ms_played >= 30000
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_listen_days() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_kurt_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT DISTINCT (p.played_at AT TIME ZONE 'America/Santiago')::date AS d
    FROM plays p
    WHERE p.ms_played >= 30000
  ),
  today AS (
    SELECT (timezone('America/Santiago', now()))::date AS d
  ),
  numbered AS (
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS grp
    FROM days
  ),
  streaks AS (
    SELECT MIN(d) AS start_d, MAX(d) AS end_d, COUNT(*)::integer AS len
    FROM numbered
    GROUP BY grp
  ),
  meta AS (
    SELECT
      t.d AS today,
      (t.d - 1) AS yesterday,
      EXISTS (SELECT 1 FROM days x WHERE x.d = t.d) AS listened_today,
      EXISTS (SELECT 1 FROM days x WHERE x.d = t.d - 1) AS listened_yesterday,
      (SELECT MAX(d) FROM days) AS last_listen_day,
      COALESCE((SELECT MAX(len) FROM streaks), 0) AS longest_streak,
      GREATEST(COALESCE((SELECT COUNT(*) FROM streaks), 0) - 1, 0) AS incidents,
      COALESCE((SELECT COUNT(*) FROM days), 0) AS total_listen_days
    FROM today t
  ),
  current AS (
    SELECT CASE
      WHEN m.listened_today THEN COALESCE(
        (SELECT s.len FROM streaks s WHERE s.end_d = m.today),
        0
      )
      WHEN m.listened_yesterday THEN COALESCE(
        (SELECT s.len FROM streaks s WHERE s.end_d = m.yesterday),
        0
      )
      ELSE 0
    END AS current_streak
    FROM meta m
  ),
  recent AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(g::date, 'YYYY-MM-DD'),
          'listened', EXISTS (SELECT 1 FROM days x WHERE x.d = g::date)
        )
        ORDER BY g
      ),
      '[]'::jsonb
    ) AS grid
    FROM meta m,
         generate_series(m.today - 27, m.today, interval '1 day') g
  )
  SELECT jsonb_build_object(
    'today', to_char(m.today, 'YYYY-MM-DD'),
    'listened_today', m.listened_today,
    'listened_yesterday', m.listened_yesterday,
    'current_streak', c.current_streak,
    'longest_streak', GREATEST(m.longest_streak, c.current_streak),
    'last_listen_day', CASE
      WHEN m.last_listen_day IS NULL THEN NULL
      ELSE to_char(m.last_listen_day, 'YYYY-MM-DD')
    END,
    'incidents', m.incidents,
    'total_listen_days', m.total_listen_days,
    'at_risk', (NOT m.listened_today AND m.listened_yesterday AND c.current_streak > 0),
    'kurt_down', (c.current_streak = 0),
    'recent', r.grid
  )
  FROM meta m, current c, recent r;
$$;

GRANT EXECUTE ON FUNCTION public.get_kurt_status() TO anon, authenticated, service_role;
