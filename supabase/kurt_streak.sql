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
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_listen_days() TO anon, authenticated, service_role;
