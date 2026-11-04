import { NextRequest, NextResponse } from "next/server";
import { ingestStreamingHistoryRecords } from "@/lib/import-streaming-records";
import { IMPORT_CHUNK_MAX_RECORDS, slimStreamingRecords } from "@/lib/streaming-history";
import type { UserCtx } from "@/lib/user-context";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImportCursor = { offset: number };

type StartBody = {
  action: "start";
  filename: string;
  fingerprint: string;
  total_records: number;
};
type ChunkBody = {
  action: "chunk";
  import_id: string;
  offset: number;
  records: unknown[];
};
type FinalizeBody = { action: "finalize"; import_id: string };
type ImportBody = StartBody | ChunkBody | FinalizeBody;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function cursorOffset(row: { cursor?: unknown }): number {
  const c = row.cursor as ImportCursor | null | undefined;
  return typeof c?.offset === "number" && c.offset >= 0 ? c.offset : 0;
}

async function loadImport(ctx: UserCtx, importId: string) {
  const { data } = await ctx.db
    .from("imports")
    .select("*")
    .eq("id", importId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data;
}

/** Crea el import o devuelve el que quedó a medias para el mismo archivo (mismo fingerprint). */
async function start(ctx: UserCtx, body: StartBody) {
  const fingerprint = String(body.fingerprint ?? "").slice(0, 128);
  const total = Number(body.total_records);
  if (!fingerprint || !body.filename || !Number.isFinite(total) || total < 0) {
    return bad("filename, fingerprint y total_records son obligatorios");
  }

  const { data: existing } = await ctx.db
    .from("imports")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("source_fingerprint", fingerprint)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status === "completed") {
    return NextResponse.json({ import: existing, offset: total, already_completed: true });
  }
  if (existing) {
    if (existing.status !== "processing") {
      await ctx.db
        .from("imports")
        .update({ status: "processing", error_message: null })
        .eq("id", existing.id)
        .eq("user_id", ctx.userId);
    }
    return NextResponse.json({ import: existing, offset: cursorOffset(existing), resumed: true });
  }

  const { data: inserted, error } = await ctx.db
    .from("imports")
    .insert({
      user_id: ctx.userId,
      filename: String(body.filename).slice(0, 200),
      source_fingerprint: fingerprint,
      status: "processing",
      total_records: total,
      processed_records: 0,
      skipped_records: 0,
      cursor: { offset: 0 },
    })
    .select()
    .single();
  if (error || !inserted) return bad(error?.message ?? "No se pudo crear el import", 500);
  return NextResponse.json({ import: inserted, offset: 0 });
}

/**
 * Idempotente por offset: si el cliente reintenta un lote ya guardado, se responde
 * sin volver a procesar; si se salta uno, recibe 409 con el offset correcto.
 */
async function chunk(ctx: UserCtx, body: ChunkBody) {
  if (!body.import_id || !Array.isArray(body.records)) {
    return bad("import_id y records son obligatorios");
  }
  if (body.records.length > IMPORT_CHUNK_MAX_RECORDS * 2) {
    return bad(`Máximo ${IMPORT_CHUNK_MAX_RECORDS} registros por lote`, 413);
  }
  const row = await loadImport(ctx, body.import_id);
  if (!row) return bad("Import no encontrado", 404);
  if (row.status === "completed") return bad("Import ya completado");

  const expected = cursorOffset(row);
  const offset = Number(body.offset);
  if (!Number.isInteger(offset) || offset < 0) return bad("offset inválido");
  if (offset + body.records.length <= expected) {
    return NextResponse.json({ import: row, offset: expected, duplicate: true });
  }
  if (offset !== expected) {
    return NextResponse.json(
      { error: "offset fuera de orden", offset: expected },
      { status: 409 },
    );
  }

  const records = slimStreamingRecords(body.records);
  const { processed, skipped } = await ingestStreamingHistoryRecords(ctx, row.id, records);
  const nextOffset = offset + body.records.length;

  const { data: updated, error } = await ctx.db
    .from("imports")
    .update({
      processed_records: (row.processed_records ?? 0) + processed,
      skipped_records: (row.skipped_records ?? 0) + skipped + (body.records.length - records.length),
      cursor: { offset: nextOffset },
    })
    .eq("id", row.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error) return bad(error.message, 500);

  return NextResponse.json({
    import: updated,
    offset: nextOffset,
    chunk_processed: processed,
    chunk_skipped: skipped,
  });
}

async function finalize(ctx: UserCtx, body: FinalizeBody) {
  const row = await loadImport(ctx, body.import_id);
  if (!row) return bad("Import no encontrado", 404);

  // El trigger de plays ya mantiene los rollups; esto los recalcula por si algún lote quedó a medias.
  const { error: rollupErr } = await ctx.db.rpc("refresh_stats_rollups_for_user", {
    p_user_id: ctx.userId,
  });
  if (rollupErr) console.warn("[import] refresh_stats_rollups_for_user", rollupErr.message);

  const { data: updated, error } = await ctx.db
    .from("imports")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      error_message: rollupErr ? `Rollups: ${rollupErr.message}`.slice(0, 500) : null,
    })
    .eq("id", row.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error) return bad(error.message, 500);
  return NextResponse.json({ import: updated, rollups_refreshed: !rollupErr });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const body = (await request.json()) as ImportBody;
    switch (body?.action) {
      case "start":
        return await start(ctx, body);
      case "chunk":
        return await chunk(ctx, body);
      case "finalize":
        return await finalize(ctx, body);
      default:
        return bad("action debe ser start, chunk o finalize");
    }
  } catch (error) {
    console.error("Import error:", error);
    return bad(error instanceof Error ? error.message : "Import failed", 500);
  }
}
