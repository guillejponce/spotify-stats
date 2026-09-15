-- OPCIONAL. Vercel ya llama a /api/cron/kurt cada hora (vercel.json).
-- Solo corre esto si quieres un backup desde Supabase (pg_cron).
-- Si CRON_SECRET en Vercel está marcado Sensitive y no lo ves, NO lo busques:
-- genera uno nuevo, pégalo en Vercel (Production + Preview) y acá abajo.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'kurt-streak-alerts';

SELECT cron.schedule(
  'kurt-streak-alerts',
  '20 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://spotify-stats-pi.vercel.app/api/cron/kurt',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  $$
);
