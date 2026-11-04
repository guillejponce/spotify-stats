import type { SpotifyStreamingRecord } from "@/types/database";

/** Por request: Vercel Hobby corta en ~10 s y 4.5 MB de body. */
export const IMPORT_CHUNK_MAX_RECORDS = 400;
export const IMPORT_CHUNK_MAX_BYTES = 1_000_000;

/** Solo el historial de música; el zip también trae video, podcasts y otros JSON. */
export function isAudioHistoryEntry(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return /^Streaming_History_Audio_.*\.json$/i.test(name);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Deja solo los campos que usa el import y descarta filas sin canción (podcasts, video, etc.). */
export function slimStreamingRecords(raw: unknown): SpotifyStreamingRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error("El JSON debe ser un array de reproducciones");
  }
  const out: SpotifyStreamingRecord[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const uri = str(r.spotify_track_uri);
    const ts = str(r.ts);
    if (!uri || !ts) continue;
    out.push({
      ts,
      ms_played: typeof r.ms_played === "number" ? r.ms_played : 0,
      master_metadata_track_name: str(r.master_metadata_track_name),
      master_metadata_album_artist_name: str(r.master_metadata_album_artist_name),
      master_metadata_album_album_name: str(r.master_metadata_album_album_name),
      spotify_track_uri: uri,
      reason_start: str(r.reason_start),
      reason_end: str(r.reason_end),
      shuffle: bool(r.shuffle),
      offline: bool(r.offline),
      platform: str(r.platform),
    });
  }
  return out;
}

/** Corta en lotes de ≤ `maxRecords` filas y ≤ `maxBytes` de JSON. */
export function chunkRecords(
  records: SpotifyStreamingRecord[],
  start = 0,
  maxRecords = IMPORT_CHUNK_MAX_RECORDS,
  maxBytes = IMPORT_CHUNK_MAX_BYTES,
): { offset: number; records: SpotifyStreamingRecord[] }[] {
  const chunks: { offset: number; records: SpotifyStreamingRecord[] }[] = [];
  let current: SpotifyStreamingRecord[] = [];
  let currentOffset = start;
  let bytes = 2;
  for (let i = start; i < records.length; i++) {
    const size = JSON.stringify(records[i]).length + 1;
    if (current.length > 0 && (current.length >= maxRecords || bytes + size > maxBytes)) {
      chunks.push({ offset: currentOffset, records: current });
      current = [];
      currentOffset = i;
      bytes = 2;
    }
    current.push(records[i]);
    bytes += size;
  }
  if (current.length > 0) chunks.push({ offset: currentOffset, records: current });
  return chunks;
}
