-- Push subscriptions + daily ranking snapshots for rise alerts.
-- Ejecutar tras ranking_deltas.sql

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ranking_snapshots (
  snapshot_date date NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('track', 'artist', 'album')),
  entity_id text NOT NULL,
  entity_name text NOT NULL,
  rank integer NOT NULL,
  play_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_date, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS ranking_snapshots_lookup_idx
  ON public.ranking_snapshots (entity_type, snapshot_date, rank);

CREATE TABLE IF NOT EXISTS public.ranking_notifications_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('track', 'artist')),
  entity_id text NOT NULL,
  snapshot_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('top100_rise', 'big_jump')),
  from_rank integer,
  to_rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, snapshot_date, kind)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_notifications_sent ENABLE ROW LEVEL SECURITY;
