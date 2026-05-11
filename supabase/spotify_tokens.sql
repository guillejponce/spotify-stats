-- Ejecutá esto en Supabase → SQL → New query → Run.
-- La app espera esta tabla para guardar OAuth (Authorization Code).

create table if not exists public.spotify_tokens (
  id text primary key,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.spotify_tokens is 'Tokens OAuth Spotify; backend upsertea id default';

alter table public.spotify_tokens enable row level security;

-- El cliente servidor usa SUPABASE_SERVICE_ROLE_KEY y no pasa por RLS.
-- Sin políticas públicas → anon desde el navegador no puede leer tokens.

