export interface Artist {
  id: string;
  name: string;
  genres: string[] | null;
  image_url: string | null;
  spotify_url: string | null;
  created_at: string;
}

export interface Album {
  id: string;
  name: string;
  artist_id: string;
  image_url: string | null;
  spotify_url: string | null;
  release_date: string | null;
  created_at: string;
}

export interface Track {
  id: string;
  name: string;
  artist_id: string;
  album_id: string | null;
  duration_ms: number | null;
  spotify_url: string | null;
  created_at: string;
}

export interface Play {
  id: string;
  track_id: string;
  played_at: string;
  ms_played: number;
  reason_start: string | null;
  reason_end: string | null;
  shuffle: boolean;
  offline: boolean;
  platform: string | null;
  import_id: string | null;
  created_at: string;
}

export interface NowPlaying {
  id: number;
  track_id: string | null;
  artist_id: string | null;
  album_id: string | null;
  track_name: string;
  artist_name: string;
  album_name: string;
  album_art_url: string | null;
  duration_ms: number;
  progress_ms: number;
  is_playing: boolean;
  updated_at: string;
}

export interface Import {
  id: string;
  user_id: string;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_records: number;
  processed_records: number;
  skipped_records: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PlayWithDetails extends Play {
  track: Track & {
    artist: Artist;
    album: Album | null;
  };
}

export interface TopItem {
  id: string;
  name: string;
  image_url: string | null;
  play_count: number;
  total_ms_played: number;
}

export interface ListeningTimeData {
  date: string;
  ms_played: number;
  play_count: number;
}

export interface HourlyData {
  hour: number;
  ms_played: number;
  play_count: number;
}

/** Mes civil Chile `YYYY-MM` (p. ej. meses con más reproducciones en el rango). */
export interface MonthBucket {
  period: string;
  ms_played: number;
  play_count: number;
}

/** Año civil Chile con totales en el rango. */
export interface YearBucket {
  year: number;
  ms_played: number;
  play_count: number;
}

export interface DayOfWeekData {
  day: number;
  day_name: string;
  ms_played: number;
  play_count: number;
}

export type TimeFilter =
  | "all"
  | "last_6_months"
  | "last_month"
  | "last_week"
  | "year"
  | "month"
  | "week"
  | "day";

export interface TimeFilterParams {
  filter: TimeFilter;
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
}

export interface SpotifyStreamingRecord {
  ts: string;
  ms_played: number;
  master_metadata_track_name: string | null;
  master_metadata_album_artist_name: string | null;
  master_metadata_album_album_name: string | null;
  spotify_track_uri: string | null;
  reason_start: string | null;
  reason_end: string | null;
  shuffle: boolean | null;
  offline: boolean | null;
  platform: string | null;
}
