-- Avisos de racha de Kurt cada hora (pg_cron). Vercel Hobby no puede.
--
-- El Bearer tiene que coincidir con CRON_SECRET en Vercel.
-- Si no lo ves ahí (Sensitive), cópialo del job que ya existe:
--   SELECT jobname, command FROM cron.job;
-- El ranking-alerts-daily trae `Bearer …` en command. Pegalo abajo
-- en lugar de __CRON_SECRET__.
--
-- Si no hay ningún job todavía: openssl rand -hex 32
-- → pega ese valor en Vercel (CRON_SECRET, Production) y acá.
-- Redeploy después de cambiar el env.

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

-- Verificar:
--   SELECT * FROM cron.job WHERE jobname = 'kurt-streak-alerts';
-- Historial:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
