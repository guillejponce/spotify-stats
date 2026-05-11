"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es as esLocale } from "date-fns/locale/es";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  Sparkles,
  X,
  History as TimelineIcon,
} from "lucide-react";
import { HistoryPlayRow } from "@/components/history/history-play-row";
import { useHistoryPlays } from "@/hooks/use-history-plays";

function HistorySkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const {
    page,
    setPage,
    plays,
    hasMore,
    loading,
    silentBusy,
    error,
    generatedAt,
    freshBatch,
    clearFreshBadge,
    refresh,
    limit,
  } = useHistoryPlays({ limit: 50 });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const lastSyncLabel =
    generatedAt && !Number.isNaN(generatedAt.getTime())
      ? formatDistanceToNow(generatedAt, {
          addSuffix: true,
          locale: esLocale,
        })
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Historial
            </h1>
            {page === 0 && silentBusy && !loading && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-spotify-light-gray/90">
                <Loader2 className="h-3 w-3 animate-spin text-spotify-green" />
                Actualizando…
              </span>
            )}
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-spotify-light-gray">
            Ordenado del más reciente al más antiguo (hora Chile). En la primera
            página el listado se vuelve a pedir solo cada unos segundos mientras
            la pestaña está visible, para que veas entradas nuevas sin recargar.
          </p>
          {page === 0 && lastSyncLabel && (
            <p
              key={tick}
              className="text-xs text-spotify-light-gray/55"
              suppressHydrationWarning
            >
              Última lectura al servidor {lastSyncLabel}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {page > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/15 text-white/90"
              onClick={() => setPage(0)}
            >
              <TimelineIcon className="mr-1.5 h-4 w-4" />
              Ver lo más reciente
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100/95"
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">No se pudo refrescar</p>
            <p className="mt-1 text-red-100/75">{error}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => void refresh()}
          >
            Reintentar
          </Button>
        </div>
      )}

      {freshBatch && page === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-spotify-green/35 bg-spotify-green/10 px-4 py-2.5 text-sm text-white/95">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-spotify-green" />
            Hay reproducciones nuevas arriba del listado.
          </span>
          <button
            type="button"
            onClick={clearFreshBadge}
            className="rounded p-1 text-spotify-light-gray transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="overflow-hidden border-white/[0.06] bg-[#181818]">
        <CardHeader className="border-b border-white/[0.06] pb-4">
          <CardTitle className="text-lg font-semibold text-white">
            Últimos plays
          </CardTitle>
          <p className="text-xs text-spotify-light-gray/70">
            {page === 0
              ? `Mostrando hasta ${limit} filas por página · sync en vivo en esta vista`
              : `Página ${page + 1} · sincronización automática sólo en la primera página`}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          {loading ? (
            <HistorySkeletonRows />
          ) : plays.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <p className="text-sm font-medium text-white/90">
                Todavía no hay plays en la base
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-spotify-light-gray/75">
                Conectá Spotify, importá tu historial o esperá a que el job de
                sincronización guarde reproducciones recientes.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {plays.map((play, i) => (
                <HistoryPlayRow
                  key={play.id}
                  play={play}
                  emphasizeTop={Boolean(freshBatch && i === 0)}
                />
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs tabular-nums text-spotify-light-gray">
              Página {page + 1}
              {hasMore ? "" : " · fin del historial"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
