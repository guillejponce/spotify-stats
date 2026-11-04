/**
 * Importa Extended Streaming History (.zip o .json) desde tu disco → Supabase, para un usuario.
 * Sin límite de tiempo de Vercel; mismas reglas que /api/import (sin duplicar plays) y
 * comparte el cursor: si un import web quedó a medias, este sigue desde ahí (y viceversa).
 *
 * Uso (desde la raíz del repo):
 *   npm run import:streaming -- --user <uuid> ~/Downloads/my_spotify_data.zip
 *   npm run import:streaming -- --user <uuid> Streaming_History_Audio_2018_1.json [otro.json ...]
 *
 * El uuid es el id del usuario (panel /admin o Supabase → Authentication → Users).
 * Variables en `.env.local`: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { dirname, resolve, basename, join } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";
import { ingestStreamingHistoryRecords } from "../src/lib/import-streaming-records";
import {
  chunkRecords,
  isAudioHistoryEntry,
  slimStreamingRecords,
} from "../src/lib/streaming-history";
import type { UserCtx } from "../src/lib/user-context";

/** Raíz del repo: sube desde scripts/ este archivo. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFiles(): string[] {
  const tried: string[] = [];
  const names = [".env.local", ".env"];
  let dir = process.cwd();
  for (let i = 0; i < 12 && dir !== dirname(dir); i++) {
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) {
        config({ path: p });
        tried.push(p);
      }
    }
    dir = dirname(dir);
  }
  for (const n of names) {
    const p = join(REPO_ROOT, n);
    if (existsSync(p) && !tried.includes(p)) {
      config({ path: p });
      tried.push(p);
    }
  }
  return tried;
}

const envPathsLoaded = loadEnvFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function resolveImportPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("~/")) return resolve(join(homedir(), t.slice(2)));
  return resolve(t);
}

function readEntries(abs: string): { name: string; bytes: Uint8Array }[] {
  const bytes = new Uint8Array(readFileSync(abs));
  if (!/\.zip$/i.test(abs)) return [{ name: basename(abs), bytes }];
  const files = unzipSync(bytes, { filter: (f) => isAudioHistoryEntry(f.name) });
  return Object.entries(files)
    .map(([path, data]) => ({ name: path.split("/").pop() ?? path, bytes: data }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function importEntry(ctx: UserCtx, entry: { name: string; bytes: Uint8Array }) {
  const records = slimStreamingRecords(JSON.parse(Buffer.from(entry.bytes).toString("utf8")));
  const fingerprint = createHash("sha256").update(entry.bytes).digest("hex");

  const { data: existing } = await ctx.db
    .from("imports")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("source_fingerprint", fingerprint)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "completed") {
    console.log(`⏭  ${entry.name}: ya importado (${existing.processed_records} plays)`);
    return;
  }

  let row = existing;
  if (!row) {
    const { data: inserted, error } = await ctx.db
      .from("imports")
      .insert({
        user_id: ctx.userId,
        filename: entry.name,
        source_fingerprint: fingerprint,
        status: "processing",
        total_records: records.length,
        processed_records: 0,
        skipped_records: 0,
        cursor: { offset: 0 },
      })
      .select()
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "No se pudo crear la fila imports");
    row = inserted;
  }

  let offset = typeof row.cursor?.offset === "number" ? row.cursor.offset : 0;
  let processed = row.processed_records ?? 0;
  let skipped = row.skipped_records ?? 0;
  console.log(
    `\n📂 ${entry.name} — ${records.length.toLocaleString()} filas` +
      (offset > 0 ? ` — retomando desde ${offset.toLocaleString()}` : ""),
  );

  for (const part of chunkRecords(records, offset, 2000, 8_000_000)) {
    const r = await ingestStreamingHistoryRecords(ctx, row.id, part.records);
    processed += r.processed;
    skipped += r.skipped;
    offset = part.offset + part.records.length;
    await ctx.db
      .from("imports")
      .update({ processed_records: processed, skipped_records: skipped, cursor: { offset } })
      .eq("id", row.id);
    process.stdout.write(
      `\r  ${offset.toLocaleString()} / ${records.length.toLocaleString()}  guardadas: ${processed.toLocaleString()}  omitidas: ${skipped.toLocaleString()}   `,
    );
  }

  await ctx.db
    .from("imports")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", row.id);
  console.log(`\n✅ ${entry.name} listo`);
}

function parseArgs(argv: string[]): { userId: string | null; files: string[] } {
  let userId: string | null = null;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") userId = argv[++i] ?? null;
    else if (argv[i].startsWith("--user=")) userId = argv[i].slice("--user=".length);
    else if (argv[i]) files.push(argv[i]);
  }
  return { userId, files };
}

async function main(): Promise<void> {
  const { userId, files } = parseArgs(process.argv.slice(2));
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId) || files.length === 0) {
    console.error(
      "Uso: npm run import:streaming -- --user <uuid> archivo.zip|archivo.json [más archivos]",
    );
    process.exit(1);
  }

  if (!url || !key) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.\n" +
        "Archivos .env cargados: " +
        (envPathsLoaded.length ? envPathsLoaded.join(", ") : "(ninguno)"),
    );
    process.exit(1);
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  });

  const { data: profile } = await db
    .from("profiles")
    .select("id, email, status")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    console.error(`No existe un perfil con id ${userId}`);
    process.exit(1);
  }
  console.log(`Importando para ${profile.email ?? userId} (${profile.status})`);

  const ctx: UserCtx = { db, userId };
  for (const f of files) {
    const abs = resolveImportPath(f);
    if (!existsSync(abs)) throw new Error(`No existe el archivo: ${abs}`);
    const entries = readEntries(abs);
    if (entries.length === 0) console.warn(`⚠️  ${abs}: sin Streaming_History_Audio_*.json`);
    for (const entry of entries) await importEntry(ctx, entry);
  }

  console.log("\nRecalculando rollups…");
  const { error } = await db.rpc("refresh_stats_rollups_for_user", { p_user_id: userId });
  if (error) console.warn("refresh_stats_rollups_for_user:", error.message);
  else console.log("✅ Rollups al día");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
