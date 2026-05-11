"use client";

import { useState, useEffect } from "react";
import { FileUploader } from "@/components/import/file-uploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react";
import type { Import } from "@/types/database";

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
        return <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />;
      default:
        return <Clock className="h-4 w-4 text-spotify-light-gray" />;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Import Data</h1>
        <p className="text-sm text-spotify-light-gray">
          Upload your Spotify Extended Streaming History
        </p>
      </div>

      <FileUploader onImportComplete={fetchImports} />

      {imports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previous Imports</CardTitle>
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
                      {imp.processed_records} processed · {imp.skipped_records}{" "}
                      skipped
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
