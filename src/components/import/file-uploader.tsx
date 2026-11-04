"use client";

import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  FileJson,
  Loader2,
  RotateCcw,
  Square,
  Upload,
} from "lucide-react";
import { cn, getProgressPercentage } from "@/lib/utils";
import {
  ImportCancelled,
  importHistoryEntry,
  readHistoryEntries,
  type ImportProgress,
} from "@/lib/import-client";

const ACCEPTED = /\.(zip|json)$/i;

const STATUS_LABEL: Record<ImportProgress["status"], string> = {
  queued: "En cola",
  reading: "Leyendo",
  uploading: "Subiendo",
  finalizing: "Recalculando stats",
  done: "Listo",
  error: "Error",
  cancelled: "Cancelado",
};

interface FileUploaderProps {
  onImportComplete?: () => void;
}

export function FileUploader({ onImportComplete }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<ImportProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = useCallback((list: File[]) => {
    setError(null);
    const ok = list.filter((f) => ACCEPTED.test(f.name));
    if (ok.length < list.length) setError("Solo se aceptan archivos .zip o .json");
    setFiles((prev) => [...prev, ...ok]);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const patchJob = (index: number, patch: Partial<ImportProgress>) => {
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<ImportProgress>;
    setJobs((prev) => prev.map((j, i) => (i === index ? { ...j, ...defined } : j)));
  };

  const run = async () => {
    if (files.length === 0 || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setJobs([]);

    try {
      const entries = [];
      for (const file of files) {
        try {
          const found = await readHistoryEntries(file);
          if (found.length === 0) {
            setError(
              `${file.name}: no tiene archivos Streaming_History_Audio_*.json. ¿Es el zip de "Extended streaming history"?`,
            );
          }
          entries.push(...found);
        } catch (e) {
          setError(`${file.name}: no se pudo abrir (${(e as Error).message})`);
        }
      }

      setJobs(
        entries.map((e) => ({
          name: e.name,
          total: 0,
          offset: 0,
          processed: 0,
          skipped: 0,
          resumedFrom: 0,
          status: "queued",
        })),
      );

      for (let i = 0; i < entries.length; i++) {
        if (controller.signal.aborted) {
          patchJob(i, { status: "cancelled" });
          continue;
        }
        try {
          await importHistoryEntry(entries[i], controller.signal, (p) => patchJob(i, p));
        } catch (e) {
          if (e instanceof ImportCancelled) {
            patchJob(i, { status: "cancelled" });
          } else {
            patchJob(i, { status: "error", error: (e as Error).message });
          }
        }
        // Liberar memoria del archivo ya subido.
        entries[i] = { name: entries[i].name, bytes: new Uint8Array() };
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      onImportComplete?.();
    }
  };

  const cancel = () => abortRef.current?.abort();

  const pendingJobs = jobs.some((j) => j.status === "cancelled" || j.status === "error");
  const totalRecords = jobs.reduce((s, j) => s + j.total, 0);
  const doneRecords = jobs.reduce((s, j) => s + Math.min(j.offset, j.total), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar historial</CardTitle>
          <CardDescription>
            Sube el .zip de &quot;Extended streaming history&quot; que manda Spotify (o los
            Streaming_History_Audio_*.json sueltos). Se descomprime en tu navegador y se sube en
            lotes chicos. Si se corta, vuelve a elegir el mismo archivo y sigue donde quedó. Reimportar
            no duplica escuchas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
              dragActive
                ? "border-spotify-green bg-spotify-green/5"
                : "border-white/10 bg-white/[0.02] hover:border-white/20",
            )}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              multiple
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
              className="hidden"
            />
            <Upload
              className={cn(
                "mb-3 h-10 w-10",
                dragActive ? "text-spotify-green" : "text-spotify-light-gray",
              )}
            />
            <p className="text-sm font-medium text-white">
              {dragActive ? "Suelta acá" : "Arrastra el .zip o los .json"}
            </p>
            <p className="mt-1 text-xs text-spotify-light-gray">o haz click para elegir</p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archivos ({files.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {/\.zip$/i.test(file.name) ? (
                    <FileArchive className="h-5 w-5 text-spotify-green" />
                  ) : (
                    <FileJson className="h-5 w-5 text-spotify-green" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs text-spotify-light-gray">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                {!running && (
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    className="text-xs text-spotify-light-gray hover:text-red-400"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}

            <div className="mt-4 flex gap-2">
              {running ? (
                <Button onClick={cancel} variant="outline" className="w-full">
                  <Square className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              ) : (
                <Button onClick={run} className="w-full">
                  {pendingJobs ? (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reanudar
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500/20">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progreso</CardTitle>
            {totalRecords > 0 && (
              <CardDescription>
                {doneRecords.toLocaleString()} de {totalRecords.toLocaleString()} reproducciones
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {totalRecords > 0 && (
              <Progress value={getProgressPercentage(doneRecords, totalRecords)} />
            )}
            {jobs.map((job) => (
              <div key={job.name} className="rounded-lg bg-white/5 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {job.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-spotify-green" />
                    ) : job.status === "error" || job.status === "cancelled" ? (
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    ) : job.status === "queued" ? (
                      <span className="h-4 w-4 shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-spotify-green" />
                    )}
                    <span className="truncate text-sm font-medium text-white">{job.name}</span>
                  </div>
                  <span className="shrink-0 text-xs text-spotify-light-gray">
                    {STATUS_LABEL[job.status]}
                  </span>
                </div>
                <Progress value={getProgressPercentage(job.offset, job.total || 1)} />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-spotify-light-gray">
                  <span>
                    {job.offset.toLocaleString()} / {job.total.toLocaleString()}
                  </span>
                  <span>{job.processed.toLocaleString()} guardadas</span>
                  <span>{job.skipped.toLocaleString()} omitidas</span>
                  {job.resumedFrom > 0 && job.resumedFrom < job.total && (
                    <span>retomado desde {job.resumedFrom.toLocaleString()}</span>
                  )}
                </div>
                {job.error && <p className="mt-2 text-xs text-red-400">{job.error}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
