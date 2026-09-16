"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecentSyncPhase = "idle" | "syncing" | "refreshing" | "done" | "skipped";

export function StatsSyncBanner({
  phase,
  inserted,
}: {
  phase: RecentSyncPhase;
  inserted?: number;
}) {
  if (phase === "idle" || phase === "skipped") return null;

  const copy =
    phase === "syncing" || phase === "refreshing"
      ? "Sincronizando Spotify"
      : (inserted ?? 0) > 0
        ? `${inserted} ${inserted === 1 ? "nueva" : "nuevas"}`
        : "Al día";

  const pending = phase === "syncing" || phase === "refreshing";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        pending
          ? "border-white/10 bg-white/[0.04] text-spotify-light-gray"
          : "border-spotify-green/25 bg-spotify-green/10 text-spotify-green",
      )}
    >
      {pending ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-spotify-green" aria-hidden />
      ) : (
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{copy}</span>
    </span>
  );
}
