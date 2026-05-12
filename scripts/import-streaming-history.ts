/**
 * Importa JSON de Extended Streaming History desde tu disco → Supabase.
 * Sin límite de tiempo de Vercel; usa las mismas reglas que /api/import (sin duplicar plays).
 *
 * Uso (desde la raíz del repo):
 *   npm run import:streaming -- ~/Downloads/"Spotify Extended Streaming History"/Streaming_History_Audio_2018_1.json
 *
 * Variables en `.env.local`: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (recomendado).
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { dirname, resolve, basename, join } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ingestStreamingHistoryRecords } from "../src/lib/import-streaming-records";
import type { SpotifyStreamingRecord } from "../src/types/database";

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

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

function getSupabase(): SupabaseClient {
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: WebSocket as unknown as WebSocketLikeConstructor,
    },
  });
}

function resolveImportPath(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("~/")) {
    return resolve(join(homedir(), t.slice(2)));
  }
  return resolve(t);
}

async function importOneFile(
  supabase: SupabaseClient,
  filePath: string
): Promise<void> {
  const abs = resolveImportPath(filePath);
  if (!existsSync(abs)) {
    throw new Error(`No existe el archivo: ${abs}`);
  }

  const raw = readFileSync(abs, "utf8");
  const records = JSON.parse(raw) as SpotifyStreamingRecord[];
  if (!Array.isArray(records)) {
    throw new Error(`${abs}: el JSON debe ser un array`);
  }

  const filename = basename(abs);

  const { data: inserted, error: insErr } = await supabase
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

  if (insErr || !inserted) {
    throw new Error(insErr?.message ?? "No se pudo crear la fila imports");
  }

  const importId = inserted.id as string;
  console.log(`\n📂 ${filename} — ${records.length.toLocaleString()} filas — import ${importId}`);

  const { processed, skipped } = await ingestStreamingHistoryRecords(
    supabase,
    importId,
    records,
    {
      afterEachBatch: async ({ processed: p, skipped: s }) => {
        await supabase
          .from("imports")
          .update({
            processed_records: p,
            skipped_records: s,
          })
          .eq("id", importId);
        process.stdout.write(
          `\r  plays insertadas/actualizadas: ${p.toLocaleString()}  omitidas: ${s.toLocaleString()}   `
        );
      },
    }
  );

  await supabase
    .from("imports")
    .update({
      status: "completed",
      processed_records: processed,
      skipped_records: skipped,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId);

  console.log(
    `\n✅ Listo: ${processed.toLocaleString()} OK, ${skipped.toLocaleString()} omitidas (sin metadata / duplicado en lote / error).\n`
  );
}

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter(Boolean);
  if (files.length === 0) {
    console.error(
      "Uso: npm run import:streaming -- ruta/archivo.json [otro.json ...]"
    );
    process.exit(1);
  }

  if (!url || !key) {
    console.error(
      "Faltan variables de Supabase para el cliente (URL + key).\n\n" +
        "1) En la raíz del repo, copiá y completá:\n" +
        "   cp .env.example .env.local\n" +
        "2) Editá .env.local con al menos:\n" +
        "   NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co\n" +
        "   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Project Settings → API → service_role)\n\n" +
        "Archivos .env cargados: " +
        (envPathsLoaded.length ? envPathsLoaded.join(", ") : "(ninguno encontrado)") +
        "\nCWD: " +
        process.cwd() +
        "\nRaíz detectada del repo: " +
        REPO_ROOT
    );
    process.exit(1);
  }

  const supabase = getSupabase();

  for (const f of files) {
    await importOneFile(supabase, f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
