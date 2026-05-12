import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { extractSpotifyId } from "@/lib/utils";
import type { SpotifyStreamingRecord } from "@/types/database";

/** Registros por ronda de upserts en lote (mucho menos round-trips a Supabase). */
const BATCH_SIZE = 500;

export const dynamic = "force-dynamic";
/** Vercel Pro: hasta 300s según región/plan; Hobby suele ser ~10s (el chunk + batch debe alcanzar). */
export const maxDuration = 300;

type ImportBody = {
  filename: string;
  records: SpotifyStreamingRecord[];
  /** Next chunks reuse this id (multi-request import). */
  import_id?: string;
  /** Total rows in the file; required on first chunk when `finalize === false`. */
  total_records?: number;
  /**
   * Last chunk must send `true`. First chunk only: omit or `false` for multi-part.
   * Single-shot: omit `import_id` → treated as one-shot complete (backward compatible).
   */
  finalize?: boolean;
};

function albumKey(name: string, artistId: string): string {
  return `${name}\0${artistId}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportBody;
    const { filename, records, import_id: existingImportId } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: "Invalid data: expected an array of records" },
        { status: 400 }
      );
    }

    const finalizeFlag = existingImportId
      ? body.finalize === true
      : body.finalize !== false;

    if (!existingImportId && body.finalize === false) {
      if (
        typeof body.total_records !== "number" ||
        body.total_records < 1
      ) {
        return NextResponse.json(
          {
            error:
              "total_records (full file row count) is required when starting a chunked import",
          },
          { status: 400 }
        );
      }
    }

    const supabase = createServerSupabaseClient();

    let importRecord: { id: string };
    let baseProcessed = 0;
    let baseSkipped = 0;

    if (existingImportId) {
      const { data: row, error: fetchErr } = await supabase
        .from("imports")
        .select("*")
        .eq("id", existingImportId)
        .single();

      if (fetchErr || !row) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }
      if (row.status === "completed") {
        return NextResponse.json(
          { error: "Import already completed" },
          { status: 400 }
        );
      }

      importRecord = { id: row.id };
      baseProcessed = row.processed_records ?? 0;
      baseSkipped = row.skipped_records ?? 0;
    } else {
      const totalRows = body.total_records ?? records.length;
      const { data: inserted, error: importError } = await supabase
        .from("imports")
        .insert({
          user_id: "default",
          filename,
          status: "processing",
          total_records: totalRows,
          processed_records: 0,
          skipped_records: 0,
        })
        .select()
        .single();

      if (importError || !inserted) {
        return NextResponse.json(
          { error: importError?.message ?? "Failed to create import" },
          { status: 500 }
        );
      }

      importRecord = { id: inserted.id };
    }

    let processed = 0;
    let skipped = 0;

    const flushProgress = async () => {
      await supabase
        .from("imports")
        .update({
          processed_records: baseProcessed + processed,
          skipped_records: baseSkipped + skipped,
        })
        .eq("id", importRecord.id);
    };

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
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

      const artistNames = [
        ...new Set(
          valid.map((r) => r.master_metadata_album_artist_name as string)
        ),
      ];

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

      const albumList = [...albumInputs.values()];
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

      const trackList = [...trackBySpotify.values()].map((t) => ({
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
          import_id: importRecord.id,
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

    const processedTotal = baseProcessed + processed;
    const skippedTotal = baseSkipped + skipped;

    if (finalizeFlag) {
      await supabase
        .from("imports")
        .update({
          status: "completed",
          processed_records: processedTotal,
          skipped_records: skippedTotal,
          completed_at: new Date().toISOString(),
        })
        .eq("id", importRecord.id);
    } else {
      await supabase
        .from("imports")
        .update({
          processed_records: processedTotal,
          skipped_records: skippedTotal,
        })
        .eq("id", importRecord.id);
    }

    const { data: finalImport } = await supabase
      .from("imports")
      .select()
      .eq("id", importRecord.id)
      .single();

    return NextResponse.json({
      import: finalImport,
      processed: processedTotal,
      skipped: skippedTotal,
      chunk_processed: processed,
      chunk_skipped: skipped,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
