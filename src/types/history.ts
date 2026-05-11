export interface HistoryPlay {
  id: string;
  played_at: string;
  ms_played: number;
  platform: string | null;
  reason_start: string | null;
  reason_end: string | null;
  shuffle: boolean | null;
  offline: boolean | null;
  source: string | null;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  image_url: string | null;
}

export interface HistoryApiResponse {
  plays: HistoryPlay[];
  has_more: boolean;
  generated_at: string;
}
