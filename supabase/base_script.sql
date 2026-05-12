-- ARTISTAS
create table artists (
  id text primary key, -- spotify artist id
  name text not null,
  genres text[], -- array de géneros
  image_url text,
  spotify_url text,
  popularity integer,
  followers integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ÁLBUMES
create table albums (
  id text primary key, -- spotify album id
  name text not null,
  artist_id text references artists(id),
  image_url text,
  release_date date,
  album_type text, -- album | single | compilation
  spotify_url text,
  created_at timestamptz default now()
);

-- CANCIONES
create table tracks (
  id text primary key, -- spotify track id
  name text not null,
  artist_id text references artists(id),
  album_id text references albums(id),
  duration_ms integer not null,
  explicit boolean default false,
  preview_url text,
  spotify_url text,
  popularity integer,
  created_at timestamptz default now()
);

-- IMPORTS (registro de cada archivo subido) — debe coincidir con src/app/api/import/route.ts
create table imports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'default',
  filename text not null,
  status text default 'pending', -- pending | processing | completed | failed
  total_records integer,
  processed_records integer default 0,
  skipped_records integer default 0,
  error_message text,
  date_range_start timestamptz,
  date_range_end timestamptz,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- HISTORIAL DE REPRODUCCIONES (core de todo)
create table plays (
  id uuid primary key default gen_random_uuid(),
  track_id text references tracks(id),
  artist_id text references artists(id),
  album_id text references albums(id),
  played_at timestamptz not null,
  ms_played integer not null, -- milisegundos realmente escuchados
  source text default 'spotify_export', -- 'spotify_export' | 'live'
  skipped boolean generated always as (ms_played < 30000) stored,
  reason_start text, -- trackdone | clickrow | playbtn | etc.
  reason_end text,   -- trackdone | endplay | logout | etc.
  shuffle boolean,
  offline boolean,
  platform text,     -- android | ios | web | etc.
  import_id uuid references imports(id),
  created_at timestamptz default now()
);

-- índices clave para queries de stats
create index plays_played_at_idx on plays(played_at);
create index plays_track_id_idx on plays(track_id);
create index plays_artist_id_idx on plays(artist_id);
create index plays_album_id_idx on plays(album_id);

-- NOW PLAYING (estado en vivo — una sola fila)
create table now_playing (
  id integer primary key default 1, -- singleton
  track_id text references tracks(id),
  artist_id text references artists(id),
  album_id text references albums(id),
  is_playing boolean default false,
  progress_ms integer default 0,
  updated_at timestamptz default now(),
  constraint singleton check (id = 1)
);