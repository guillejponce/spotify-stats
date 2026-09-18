export type ListenRank = {
  rank: number | null;
  plays: number;
  ms_played: number;
  among: number;
};

export type NowPlayingListenRanks = {
  track: ListenRank;
  artist: ListenRank;
};
