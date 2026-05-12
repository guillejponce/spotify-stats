import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { extractSpotifyId } from "@/lib/utils";
import type { SpotifyStreamingRecord } from "@/types/database";

const BATCH_SIZE = 500;

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        if (
          !record.master_metadata_track_name ||
          !record.master_metadata_album_artist_name ||
          !record.spotify_track_uri
        ) {
          skipped++;
          continue;
        }

        try {
          const artistName = record.master_metadata_album_artist_name;
          const { data: artist } = await supabase
            .from("artists")
            .upsert({ name: artistName }, { onConflict: "name" })
            .select("id")
            .single();

          if (!artist) { skipped++; continue; }

          let albumId: string | null = null;
          if (record.master_metadata_album_album_name) {
            const { data: album } = await supabase
              .from("albums")
              .upsert(
                {
                  name: record.master_metadata_album_album_name,
                  artist_id: artist.id,
                },
                { onConflict: "name,artist_id" }
              )
              .select("id")
              .single();
            albumId = album?.id || null;
          }

          const trackSpotifyId = extractSpotifyId(record.spotify_track_uri);
          const { data: track } = await supabase
            .from("tracks")
            .upsert(
              {
                spotify_id: trackSpotifyId,
                name: record.master_metadata_track_name,
                artist_id: artist.id,
                album_id: albumId,
              },
              { onConflict: "spotify_id" }
            )
            .select("id")
            .single();

          if (!track) { skipped++; continue; }

          const playedAt = new Date(record.ts).toISOString();
          const { error: playError } = await supabase.from("plays").upsert(
            {
              track_id: track.id,
              played_at: playedAt,
              ms_played: record.ms_played,
              reason_start: record.reason_start,
              reason_end: record.reason_end,
              shuffle: record.shuffle ?? false,
              offline: record.offline ?? false,
              platform: record.platform,
              import_id: importRecord.id,
            },
            { onConflict: "track_id,played_at" }
          );

          if (playError) {
            skipped++;
          } else {
            processed++;
          }
        } catch {
          skipped++;
        }
      }

      const processedTotal = baseProcessed + processed;
      const skippedTotal = baseSkipped + skipped;

      await supabase
        .from("imports")
        .update({
          processed_records: processedTotal,
          skipped_records: skippedTotal,
        })
        .eq("id", importRecord.id);
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
