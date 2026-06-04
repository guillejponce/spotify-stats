/** Clave lógica: misma canción = mismo artista principal + mismo título (normalizado). */
export function ratingSongKey(trackName: string, artistId: string | null): string {
  return `${normalizeTrackNameForRating(trackName)}|${artistId ?? ""}`;
}

export function normalizeTrackNameForRating(name: string): string {
  return name.trim().toLowerCase();
}

export interface TrackIdentityRow {
  id: string;
  name: string;
  artist_id: string | null;
}

export function equivalentTrackIds(
  track: TrackIdentityRow,
  allTracks: TrackIdentityRow[]
): string[] {
  const key = ratingSongKey(track.name, track.artist_id);
  return allTracks
    .filter((t) => ratingSongKey(t.name, t.artist_id) === key)
    .map((t) => t.id);
}
