"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn, getProgressPercentage } from "@/lib/utils";
import type { Import } from "@/types/database";

/** ~3MB JSON típico sigue bajo límites de Vercel/serverless; Spotify manda archivos anuales enormes. */
const IMPORT_CHUNK_RECORDS = 2000;

async function parseResponseBody(res: Response): Promise<{ json?: unknown; text: string }> {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { text };
  }
}

async function importRecordsChunked(
  filename: string,
  records: Record<string, unknown>[]
): Promise<{ import: Import; processed: number; skipped: number }> {
  const total = records.length;
  let importId: string | undefined;
  let lastProcessed = 0;
  let lastSkipped = 0;
  let lastImport: Import | null = null;

  const postChunk = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const { json, text } = await parseResponseBody(response);

    if (!response.ok) {
      const msg =
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error: unknown }).error === "string"
          ? (json as { error: string }).error
          : text.slice(0, 500) || `HTTP ${response.status}`;
      throw new Error(msg);
    }

    const result = json as {
      import?: Import;
      processed?: number;
      skipped?: number;
    };
    if (!result.import) {
      throw new Error(text.slice(0, 200) || "Invalid import response");
    }

    lastImport = result.import;
    lastProcessed = result.processed ?? 0;
    lastSkipped = result.skipped ?? 0;
    importId = result.import.id;
  };

  if (total === 0) {
    await postChunk({
      filename,
      records: [],
      total_records: 0,
      finalize: true,
    });
    if (!lastImport) throw new Error("Invalid import response");
    return { import: lastImport, processed: 0, skipped: 0 };
  }

  for (let start = 0; start < total; start += IMPORT_CHUNK_RECORDS) {
    const chunk = records.slice(start, start + IMPORT_CHUNK_RECORDS);
    const isLast = start + chunk.length >= total;

    const payload: Record<string, unknown> = {
      filename,
      records: chunk,
      finalize: isLast,
      ...(importId ? { import_id: importId } : { total_records: total }),
    };

    await postChunk(payload);
  }

  if (!lastImport) {
    throw new Error("Import finished without result");
  }

  return {
    import: lastImport,
    processed: lastProcessed,
    skipped: lastSkipped,
  };
}

interface FileUploaderProps {
  onImportComplete?: () => void;
}

export function FileUploader({ onImportComplete }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState<Import[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/json" || f.name.endsWith(".json")
    );

    if (droppedFiles.length === 0) {
      setError("Please drop JSON files only");
      return;
    }

    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      if (e.target.files) {
        setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      }
    },
    []
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setImports([]);

    for (const file of files) {
      try {
        const text = await file.text();
        const records = JSON.parse(text) as Record<string, unknown>[];

        if (!Array.isArray(records)) {
          setError(`${file.name}: File must contain a JSON array`);
          continue;
        }

        const { import: imp } = await importRecordsChunked(file.name, records);
        setImports((prev) => [...prev, imp]);
      } catch (err) {
        setError(`Error processing ${file.name}: ${(err as Error).message}`);
      }
    }

    setUploading(false);
    setFiles([]);
    onImportComplete?.();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Listening History</CardTitle>
          <CardDescription>
            Upload your Spotify Extended Streaming History JSON files
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
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            )}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload
              className={cn(
                "mb-3 h-10 w-10",
                dragActive ? "text-spotify-green" : "text-spotify-light-gray"
              )}
            />
            <p className="text-sm font-medium text-white">
              {dragActive ? "Drop files here" : "Drag & drop JSON files here"}
            </p>
            <p className="mt-1 text-xs text-spotify-light-gray">
              or click to browse
            </p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Selected Files ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <FileJson className="h-5 w-5 text-spotify-green" />
                  <div>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs text-spotify-light-gray">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-xs text-spotify-light-gray hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}

            <Button onClick={handleUpload} disabled={uploading} className="mt-4 w-full">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {files.length} file{files.length > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500/20">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {imports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {imports.map((imp) => (
              <div key={imp.id} className="rounded-lg bg-white/5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {imp.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-spotify-green" />
                    ) : imp.status === "failed" ? (
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
                    )}
                    <span className="text-sm font-medium text-white">{imp.filename}</span>
                  </div>
                  <span className="text-xs capitalize text-spotify-light-gray">{imp.status}</span>
                </div>
                <Progress
                  value={getProgressPercentage(imp.processed_records, imp.total_records)}
                />
                <div className="mt-2 flex gap-4 text-xs text-spotify-light-gray">
                  <span>{imp.processed_records} processed</span>
                  <span>{imp.skipped_records} skipped</span>
                  <span>{imp.total_records} total</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
