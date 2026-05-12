-- Run in Supabase → SQL Editor (todo el archivo de una vez).
--
-- Cubre el esquema tipo `BDD.sql` (imports con total_rows/imported_rows, plays sin import_id)
-- y lo que exige `src/app/api/import/route.ts`.
--
-- 1) imports: columnas nuevas (arregla "processed_records" / schema cache).
-- 2) plays.import_id + índice único (necesario para upsert track_id+played_at).
-- 3) artists / albums: deduplicar filas, índice único + default en id.
-- 4) tracks: columna spotify_id + default id (el import manda spotify_id, no id; BDD solo tiene id).
-- 5) tracks.duration_ms: default 0 (el import no envía duration_ms).

-- ─── imports (tu BDD tiene total_rows, imported_rows, skipped_rows, finished_at) ───
alter table public.imports add column if not exists user_id text default 'default';
alter table public.imports add column if not exists total_records integer;
alter table public.imports add column if not exists processed_records integer default 0;
alter table public.imports add column if not exists skipped_records integer default 0;
alter table public.imports add column if not exists completed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'imports'
      and c.column_name = 'total_rows'
  ) then
    update public.imports
    set
      total_records = coalesce(total_records, total_rows),
      processed_records = coalesce(processed_records, imported_rows, 0),
      skipped_records = coalesce(skipped_records, skipped_rows, 0),
      completed_at = coalesce(completed_at, finished_at);
  end if;
end $$;

-- ─── plays ───
alter table public.plays add column if not exists import_id uuid references public.imports(id);

create unique index if not exists plays_track_played_at_unique
  on public.plays (track_id, played_at);

-- ─── artists / albums: quitar duplicados antes del índice único ───
-- Se conserva el id más “chico” en orden lexicográfico por grupo (estable).
-- Orden: primero artistas, después álbumos (unir artistas puede generar álbumos repetidos).

drop table if exists _artist_redir;
create temporary table _artist_redir (old_id text primary key, new_id text not null);

insert into _artist_redir (old_id, new_id)
select id, keep_id
from (
  select
    id,
    first_value(id) over (partition by name order by id) as keep_id,
    row_number() over (partition by name order by id) as rn
  from public.artists
) s
where rn > 1;

update public.albums al set artist_id = r.new_id from _artist_redir r where al.artist_id = r.old_id;
update public.tracks tr set artist_id = r.new_id from _artist_redir r where tr.artist_id = r.old_id;
update public.plays pl set artist_id = r.new_id from _artist_redir r where pl.artist_id = r.old_id;
update public.now_playing np set artist_id = r.new_id from _artist_redir r where np.artist_id = r.old_id;

delete from public.artists a using _artist_redir r where a.id = r.old_id;

drop table if exists _album_redir;
create temporary table _album_redir (old_id text primary key, new_id text not null);

insert into _album_redir (old_id, new_id)
select id, keep_id
from (
  select
    id,
    first_value(id) over (partition by name, artist_id order by id) as keep_id,
    row_number() over (partition by name, artist_id order by id) as rn
  from public.albums
) s
where rn > 1;

update public.tracks tr set album_id = r.new_id from _album_redir r where tr.album_id = r.old_id;
update public.plays pl set album_id = r.new_id from _album_redir r where pl.album_id = r.old_id;
update public.now_playing np set album_id = r.new_id from _album_redir r where np.album_id = r.old_id;

delete from public.albums a using _album_redir r where a.id = r.old_id;

create unique index if not exists artists_name_unique on public.artists (name);
create unique index if not exists albums_name_artist_unique on public.albums (name, artist_id);

alter table public.artists alter column id set default gen_random_uuid()::text;
alter table public.albums alter column id set default gen_random_uuid()::text;

-- ─── tracks: import usa spotify_id + onConflict spotify_id ───
alter table public.tracks add column if not exists spotify_id text;

update public.tracks tr
set spotify_id = tr.id
where tr.spotify_id is null
  and tr.id is not null;

create unique index if not exists tracks_spotify_id_unique on public.tracks (spotify_id);
alter table public.tracks alter column id set default gen_random_uuid()::text;
alter table public.tracks alter column duration_ms set default 0;

drop table if exists _artist_redir;
drop table if exists _album_redir;
