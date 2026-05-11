import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { extractSpotifyId } from "@/lib/utils";
import type { SpotifyStreamingRecord } from "@/types/database";

const BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  try {
    const { filename, records } = (await request.json()) as {
      filename: string;
      records: SpotifyStreamingRecord[];
    };

    if (!records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: "Invalid data: expected an array of records" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        user_id: "default",
        filename,
        status: "processing",
        total_records: records.length,
        processed_records: 0,
        skipped_records: 0,
      })
      .select()
      .single();

    if (importError) {
      return NextResponse.json({ error: importError.message }, { status: 500 });
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

      await supabase
        .from("imports")
        .update({ processed_records: processed, skipped_records: skipped })
        .eq("id", importRecord.id);
    }

    await supabase
      .from("imports")
      .update({
        status: "completed",
        processed_records: processed,
        skipped_records: skipped,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRecord.id);

    const { data: finalImport } = await supabase
      .from("imports")
      .select()
      .eq("id", importRecord.id)
      .single();

    return NextResponse.json({ import: finalImport, processed, skipped });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
