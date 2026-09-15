"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Loader2, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import { msUntilChileMidnight } from "@/lib/chile-time";
import type { KurtStatus } from "@/lib/kurt-types";

type Mood = {
  headline: string;
  subtitle: string;
  tone: "alive" | "risk" | "down";
};

function formatUntilShot(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function KurtStreakCard() {
  const [status, setStatus] = useState<KurtStatus | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kurt/status", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        status?: KurtStatus;
        mood?: Mood;
      };
      if (!res.ok || !json.ok || !json.status) return;
      setStatus(json.status);
      setMood(json.mood ?? null);
      setRemainingMs(msUntilChileMidnight());
    } catch {
      // keep last snapshot
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!status?.at_risk) return;
    const id = window.setInterval(() => {
      const left = msUntilChileMidnight();
      setRemainingMs(left);
      if (left <= 0) void load();
    }, 1000);
    return () => window.clearInterval(id);
  }, [status?.at_risk, load]);

  if (!status || !mood) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
        Contando la racha de Kurt…
      </div>
    );
  }

  const down = mood.tone === "down";
  const risk = mood.tone === "risk";
  const recent = status.recent.slice(-7);

  return (
    <Link
      href="/kurt"
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition",
        down
          ? "border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15"
          : risk
            ? "border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/15"
            : "border-spotify-green/20 bg-spotify-green/10 hover:bg-spotify-green/15",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          down
            ? "bg-rose-500/20 text-rose-300"
            : risk
              ? "bg-amber-400/20 text-amber-300"
              : "bg-spotify-green/20 text-spotify-green",
        )}
      >
        {down ? <Skull className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-white">
            {status.current_streak}{" "}
            {status.current_streak === 1 ? "día" : "días"} sin disparos
          </span>
          {risk && (
            <span className="font-mono text-xs font-semibold tabular-nums text-amber-200">
              se dispara en {formatUntilShot(remainingMs)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-white/55">
          {down
            ? "Kurt se disparó. Un tema de 30s lo resucita."
            : risk
              ? "Hoy todavía no hay música. Medianoche Chile = racha a 0."
              : "Hoy ya escuchaste. Kurt está a salvo."}
        </span>
        {risk && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-black/30">
            <span
              className="block h-full rounded-full bg-amber-300 transition-[width] duration-1000 ease-linear"
              style={{
                width: `${Math.min(100, Math.max(2, (1 - remainingMs / 86_400_000) * 100))}%`,
              }}
            />
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
        {recent.map((day) => (
          <span
            key={day.date}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              day.listened ? "bg-spotify-green" : "bg-white/15",
            )}
          />
        ))}
      </span>
    </Link>
  );
}
