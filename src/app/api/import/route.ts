import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { ingestStreamingHistoryRecords } from "@/lib/import-streaming-records";
import type { SpotifyStreamingRecord } from "@/types/database";

export const dynamic = "force-dynamic";
/** Vercel Pro puede usar hasta ~300s; Hobby ~10s — para años completos usá `npm run import:streaming`. */
export const maxDuration = 300;

type ImportBody = {
  filename: string;
  records: SpotifyStreamingRecord[];
  import_id?: string;
  total_records?: number;
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

    const { processed: chunkProcessed, skipped: chunkSkipped } =
      await ingestStreamingHistoryRecords(
        supabase,
        importRecord.id,
        records,
        {
          afterEachBatch: async ({ processed, skipped }) => {
            await supabase
              .from("imports")
              .update({
                processed_records: baseProcessed + processed,
                skipped_records: baseSkipped + skipped,
              })
              .eq("id", importRecord.id);
          },
        }
      );

    const processedTotal = baseProcessed + chunkProcessed;
    const skippedTotal = baseSkipped + chunkSkipped;

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
      chunk_processed: chunkProcessed,
      chunk_skipped: chunkSkipped,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
