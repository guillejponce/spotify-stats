"use client";

import { useState, useEffect } from "react";
import { FileUploader } from "@/components/import/file-uploader";
import { ImportGuide } from "@/components/import/import-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react";
import type { Import } from "@/types/database";
import { PageHeader } from "@/components/ui/page-header";

export default function ImportPage() {
  const [imports, setImports] = useState<Import[]>([]);
  const [loadingImports, setLoadingImports] = useState(true);

  const fetchImports = async () => {
    try {
      const res = await fetch("/api/imports");
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingImports(false);
    }
  };

  useEffect(() => {
    fetchImports();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-spotify-green" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-spotify-green" />;
      default:
        return <Clock className="h-4 w-4 text-spotify-light-gray" />;
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Importar historial"
        description="Sube el historial de streaming extendido que te manda Spotify."
      />

      {!loadingImports && <ImportGuide defaultOpen={imports.length === 0} />}

      <FileUploader onImportComplete={fetchImports} />

      {imports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Importaciones anteriores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {imports.map((imp) => (
              <div
                key={imp.id}
                className="flex items-center justify-between rounded-lg bg-white/5 p-3"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(imp.status)}
                  <div>
                    <p className="text-sm font-medium text-white">
                      {imp.filename}
                    </p>
                    <p className="text-xs text-spotify-light-gray">
                      {imp.processed_records} procesadas · {imp.skipped_records}{" "}
                      omitidas
                      {imp.status === "processing" &&
                        " · a medias: sube el mismo archivo para seguir"}
                    </p>
                  </div>
                </div>
                <span className="text-xs capitalize text-spotify-light-gray">
                  {new Date(imp.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
