-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.albums (
  id text NOT NULL,
  name text NOT NULL,
  artist_id text,
  image_url text,
  release_date date,
  album_type text,
  spotify_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT albums_pkey PRIMARY KEY (id),
  CONSTRAINT albums_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id)
);
CREATE TABLE public.artists (
  id text NOT NULL,
  name text NOT NULL,
  genres ARRAY,
  image_url text,
  spotify_url text,
  popularity integer,
  followers integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT artists_pkey PRIMARY KEY (id)
);
CREATE TABLE public.imports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  status text DEFAULT 'pending'::text,
  total_rows integer,
  imported_rows integer,
  skipped_rows integer,
  error_message text,
  date_range_start timestamp with time zone,
  date_range_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  finished_at timestamp with time zone,
  CONSTRAINT imports_pkey PRIMARY KEY (id)
);
CREATE TABLE public.now_playing (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  track_id text,
  artist_id text,
  album_id text,
  is_playing boolean DEFAULT false,
  progress_ms integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT now_playing_pkey PRIMARY KEY (id),
  CONSTRAINT now_playing_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.tracks(id),
  CONSTRAINT now_playing_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id),
  CONSTRAINT now_playing_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.albums(id)
);
CREATE TABLE public.plays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  track_id text,
  artist_id text,
  album_id text,
  played_at timestamp with time zone NOT NULL,
  ms_played integer NOT NULL,
  source text DEFAULT 'spotify_export'::text,
  skipped boolean DEFAULT (ms_played < 30000),
  reason_start text,
  reason_end text,
  shuffle boolean,
  offline boolean,
  platform text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT plays_pkey PRIMARY KEY (id),
  CONSTRAINT plays_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.tracks(id),
  CONSTRAINT plays_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id),
  CONSTRAINT plays_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.albums(id)
);
CREATE TABLE public.spotify_tokens (
  id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT spotify_tokens_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tracks (
  id text NOT NULL,
  name text NOT NULL,
  artist_id text,
  album_id text,
  duration_ms integer NOT NULL,
  explicit boolean DEFAULT false,
  preview_url text,
  spotify_url text,
  popularity integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tracks_pkey PRIMARY KEY (id),
  CONSTRAINT tracks_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id),
  CONSTRAINT tracks_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.albums(id)
);