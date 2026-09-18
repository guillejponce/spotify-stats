export type WrappedRacer = {
  id: string;
  name: string;
  subtitle: string | null;
  image_url: string | null;
  play_count: number;
  ms_played: number;
  rank: number;
  href: string | null;
};

export type WrappedRace = {
  title: string;
  trophy: string;
  tightness: "open" | "fight" | "runaway" | "empty";
  tightness_label: string;
  locked: boolean;
  items: WrappedRacer[];
};

export type WrappedDayHit = {
  date: string;
  label: string;
  play_count: number;
  ms_played: number;
};

export type WrappedFact = {
  label: string;
  value: string;
  hint?: string;
};

export type WrappedPayload = {
  year: number;
  generated_at: string;
  is_current_year: boolean;
  available_years: number[];
  progress: {
    elapsed_days: number;
    total_days: number;
    remaining_days: number;
    pct: number;
    today: string;
  };
  totals: {
    ms_played: number;
    play_count: number;
    listen_days: number;
    projected_ms: number;
  };
  vs_last_year: {
    last_year: number;
    ms_played: number;
    play_count: number;
    listen_days: number;
    ms_delta_pct: number | null;
  } | null;
  races: {
    track: WrappedRace;
    artist: WrappedRace;
    album: WrappedRace;
  };
  months: { period: string; ms_played: number; play_count: number }[];
  top_days: WrappedDayHit[];
  hourly: { hour: number; ms_played: number; play_count: number }[];
  daily: { date: string; ms_played: number; play_count: number }[];
  heatmap: { date: string; count: number; ms_played: number }[];
  facts: WrappedFact[];
};
