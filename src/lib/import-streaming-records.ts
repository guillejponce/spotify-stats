import type { SupabaseClient } from "@supabase/supabase-js";
import { extractSpotifyId } from "@/lib/utils";
import type { SpotifyStreamingRecord } from "@/types/database";

export const STREAMING_IMPORT_BATCH_SIZE = 500;

export function albumKey(name: string, artistId: string): string {
  return `${name}\0${artistId}`;
}

/**
 * Procesa filas de Extended Streaming History: upserts en lote a artists / albums / tracks / plays.
 * `plays` usa conflicto (track_id, played_at) → reimportar el mismo archivo no duplica escuchas.
 */
export async function ingestStreamingHistoryRecords(
  supabase: SupabaseClient,
  importId: string,
  records: SpotifyStreamingRecord[],
  options?: {
    afterEachBatch?: (totals: {
      processed: number;
      skipped: number;
    }) => Promise<void>;
  }
): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  const flushProgress = async () => {
    await options?.afterEachBatch?.({ processed, skipped });
  };

  for (let i = 0; i < records.length; i += STREAMING_IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + STREAMING_IMPORT_BATCH_SIZE);
    const valid: SpotifyStreamingRecord[] = [];

    for (const record of batch) {
      if (
        !record.master_metadata_track_name ||
        !record.master_metadata_album_artist_name ||
        !record.spotify_track_uri
      ) {
        skipped++;
        continue;
      }
      if (!extractSpotifyId(record.spotify_track_uri)) {
        skipped++;
        continue;
      }
      valid.push(record);
    }

    if (valid.length === 0) {
      await flushProgress();
      continue;
    }

    const artistNames = Array.from(
      new Set(
        valid.map((r) => r.master_metadata_album_artist_name as string),
      ),
    );

    const { data: artistRows, error: artistsErr } = await supabase
      .from("artists")
      .upsert(artistNames.map((name) => ({ name })), { onConflict: "name" })
      .select("id, name");

    if (artistsErr || !artistRows?.length) {
      skipped += valid.length;
      await flushProgress();
      continue;
    }

    const artistIdByName = new Map(artistRows.map((a) => [a.name, a.id]));

    const albumInputs = new Map<
      string,
      { name: string; artist_id: string }
    >();
    for (const r of valid) {
      const alb = r.master_metadata_album_album_name;
      if (!alb) continue;
      const artistName = r.master_metadata_album_artist_name as string;
      const aid = artistIdByName.get(artistName);
      if (!aid) continue;
      albumInputs.set(albumKey(alb, aid), { name: alb, artist_id: aid });
    }

    const albumList = Array.from(albumInputs.values());
    const albumIdByKey = new Map<string, string>();

    if (albumList.length > 0) {
      const { data: albRows, error: albumsErr } = await supabase
        .from("albums")
        .upsert(albumList, { onConflict: "name,artist_id" })
        .select("id, name, artist_id");

      if (albumsErr || !albRows) {
        skipped += valid.length;
        await flushProgress();
        continue;
      }

      for (const a of albRows) {
        albumIdByKey.set(
          albumKey(a.name, a.artist_id as string),
          a.id
        );
      }
    }

    const trackBySpotify = new Map<
      string,
      {
        spotify_id: string;
        name: string;
        artist_id: string;
        album_id: string | null;
      }
    >();

    for (const r of valid) {
      const sid = extractSpotifyId(r.spotify_track_uri) as string;
      const artistName = r.master_metadata_album_artist_name as string;
      const aid = artistIdByName.get(artistName);
      if (!aid) {
        skipped++;
        continue;
      }
      let albumId: string | null = null;
      const albName = r.master_metadata_album_album_name;
      if (albName) {
        albumId = albumIdByKey.get(albumKey(albName, aid)) ?? null;
      }
      trackBySpotify.set(sid, {
        spotify_id: sid,
        name: r.master_metadata_track_name as string,
        artist_id: aid,
        album_id: albumId,
      });
    }

    const trackList = Array.from(trackBySpotify.values()).map((t) => ({
      spotify_id: t.spotify_id,
      name: t.name,
      artist_id: t.artist_id,
      album_id: t.album_id,
      duration_ms: 0,
    }));

    if (trackList.length === 0) {
      await flushProgress();
      continue;
    }

    const { data: trackRows, error: tracksErr } = await supabase
      .from("tracks")
      .upsert(trackList, { onConflict: "spotify_id" })
      .select("id, spotify_id");

    if (tracksErr || !trackRows?.length) {
      skipped += valid.length;
      await flushProgress();
      continue;
    }

    const trackIdBySpotify = new Map(
      trackRows.map((t) => [t.spotify_id as string, t.id])
    );

    const playDedup = new Set<string>();
    const playRows: {
      track_id: string;
      played_at: string;
      ms_played: number;
      reason_start: string | null;
      reason_end: string | null;
      shuffle: boolean;
      offline: boolean;
      platform: string | null;
      import_id: string;
    }[] = [];

    for (const r of valid) {
      const sid = extractSpotifyId(r.spotify_track_uri) as string;
      const tid = trackIdBySpotify.get(sid);
      if (!tid) {
        skipped++;
        continue;
      }
      const playedAt = new Date(r.ts).toISOString();
      const pkey = `${tid}\0${playedAt}`;
      if (playDedup.has(pkey)) {
        skipped++;
        continue;
      }
      playDedup.add(pkey);
      playRows.push({
        track_id: tid,
        played_at: playedAt,
        ms_played: r.ms_played,
        reason_start: r.reason_start,
        reason_end: r.reason_end,
        shuffle: r.shuffle ?? false,
        offline: r.offline ?? false,
        platform: r.platform,
        import_id: importId,
      });
    }

    if (playRows.length === 0) {
      await flushProgress();
      continue;
    }

    const { error: playsErr } = await supabase.from("plays").upsert(
      playRows,
      { onConflict: "track_id,played_at" }
    );

    if (playsErr) {
      skipped += playRows.length;
    } else {
      processed += playRows.length;
    }

    await flushProgress();
  }

  return { processed, skipped };
}
