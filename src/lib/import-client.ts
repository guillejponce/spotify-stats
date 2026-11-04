import { unzip } from "fflate";
import { chunkRecords, isAudioHistoryEntry, slimStreamingRecords } from "@/lib/streaming-history";
import type { Import } from "@/types/database";

const RETRIES = 5;

export type HistoryEntry = { name: string; bytes: Uint8Array };

export type ImportProgress = {
  name: string;
  total: number;
  offset: number;
  processed: number;
  skipped: number;
  resumedFrom: number;
  status: "queued" | "reading" | "uploading" | "finalizing" | "done" | "error" | "cancelled";
  error?: string;
};

export class ImportCancelled extends Error {
  constructor() {
    super("Importación cancelada");
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ImportCancelled());
    });
  });
}

/** Extrae solo `Streaming_History_Audio_*.json`; un .json suelto se usa tal cual. */
export async function readHistoryEntries(file: File): Promise<HistoryEntry[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") {
    return [{ name: file.name, bytes }];
  }
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, { filter: (f) => isAudioHistoryEntry(f.name) }, (err, out) =>
      err ? reject(err) : resolve(out),
    );
  });
  return Object.entries(files)
    .map(([path, data]) => ({ name: path.split("/").pop() ?? path, bytes: data }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type ApiResult = {
  import?: Import;
  offset?: number;
  already_completed?: boolean;
  error?: string;
};

async function post(body: unknown, signal: AbortSignal): Promise<{ status: number; json: ApiResult }> {
  let lastError = "Error de red";
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (signal.aborted) throw new ImportCancelled();
    let res: Response;
    try {
      res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw new ImportCancelled();
      lastError = e instanceof Error ? e.message : String(e);
      await sleep(1500 * 2 ** attempt, signal);
      continue;
    }
    const text = await res.text();
    let json: ApiResult;
    try {
      json = JSON.parse(text) as ApiResult;
    } catch {
      json = { error: text.slice(0, 200) };
    }
    if (res.ok || res.status === 409) return { status: res.status, json };
    lastError = json.error ?? `HTTP ${res.status}`;
    if (![408, 429, 500, 502, 503, 504].includes(res.status)) throw new Error(lastError);
    await sleep(1500 * 2 ** attempt, signal);
  }
  throw new Error(lastError);
}

/** Sube un archivo del historial en lotes; si ya existía un import a medias, sigue desde su cursor. */
export async function importHistoryEntry(
  entry: HistoryEntry,
  signal: AbortSignal,
  onProgress: (p: Partial<ImportProgress>) => void,
): Promise<void> {
  onProgress({ status: "reading" });
  const records = slimStreamingRecords(JSON.parse(new TextDecoder().decode(entry.bytes)));
  const fp = await fingerprint(entry.bytes);

  const started = await post(
    { action: "start", filename: entry.name, fingerprint: fp, total_records: records.length },
    signal,
  );
  if (started.json.already_completed) {
    onProgress({
      status: "done",
      total: records.length,
      offset: records.length,
      processed: started.json.import?.processed_records ?? 0,
      skipped: started.json.import?.skipped_records ?? 0,
      resumedFrom: records.length,
    });
    return;
  }
  const importId = started.json.import?.id;
  if (!importId) throw new Error(started.json.error ?? "No se pudo iniciar el import");

  let offset = started.json.offset ?? 0;
  onProgress({
    status: "uploading",
    total: records.length,
    offset,
    resumedFrom: offset,
    processed: started.json.import?.processed_records ?? 0,
    skipped: started.json.import?.skipped_records ?? 0,
  });

  while (offset < records.length) {
    for (const part of chunkRecords(records, offset)) {
      const res = await post(
        { action: "chunk", import_id: importId, offset: part.offset, records: part.records },
        signal,
      );
      if (res.status === 409) {
        offset = res.json.offset ?? offset;
        break;
      }
      offset = res.json.offset ?? part.offset + part.records.length;
      onProgress({
        offset,
        processed: res.json.import?.processed_records,
        skipped: res.json.import?.skipped_records,
      });
    }
  }

  onProgress({ status: "finalizing" });
  const done = await post({ action: "finalize", import_id: importId }, signal);
  onProgress({
    status: "done",
    offset: records.length,
    processed: done.json.import?.processed_records,
    skipped: done.json.import?.skipped_records,
  });
}
