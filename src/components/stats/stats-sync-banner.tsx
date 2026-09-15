"use client";

import { CheckCircle2, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecentSyncPhase = "idle" | "syncing" | "refreshing" | "done" | "skipped";

export function StatsSyncBanner({
  phase,
  inserted,
}: {
  phase: RecentSyncPhase;
  inserted?: number;
}) {
  if (phase === "idle") return null;

  const copy =
    phase === "syncing"
      ? "Trayendo las últimas reproducciones de Spotify…"
      : phase === "refreshing"
        ? "Actualizando tus stats con lo más reciente…"
        : phase === "done" && (inserted ?? 0) > 0
          ? `Listo · ${inserted} ${inserted === 1 ? "reproducción nueva" : "reproducciones nuevas"}`
          : phase === "done"
            ? "Al día con Spotify"
            : "Sin conexión a Spotify para sincronizar";

  const Icon =
    phase === "done"
      ? CheckCircle2
      : phase === "skipped"
        ? Radio
        : Loader2;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-2.5 text-sm",
        phase === "done"
          ? "border-spotify-green/25 bg-spotify-green/10 text-spotify-green"
          : phase === "skipped"
            ? "border-white/10 bg-white/[0.04] text-spotify-light-gray"
            : "border-spotify-green/20 bg-gradient-to-r from-spotify-green/15 via-white/[0.04] to-transparent text-white",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          phase === "done" ? "bg-spotify-green/15" : "bg-white/5",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            (phase === "syncing" || phase === "refreshing") && "animate-spin text-spotify-green",
          )}
          aria-hidden
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-tight">{copy}</p>
        {(phase === "syncing" || phase === "refreshing") && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[shimmer-bar_1.4s_ease-in-out_infinite] rounded-full bg-spotify-green" />
          </div>
        )}
      </div>
    </div>
  );
}
