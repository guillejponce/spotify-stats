export type SongChart = {
  id: string;
  track_id: string;
  title: string;
  artist_name: string;
  content: string;
  original_key: string | null;
  capo: number;
  created_at: string;
  updated_at: string;
};

export type ChartTrack = {
  id: string;
  name: string;
  artist_id: string | null;
  artist_name: string | null;
  album_name: string | null;
  image_url: string | null;
};

export type ChartSearchHit = ChartTrack & { has_chart: boolean };
