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
    const ms = status?.at_risk || status?.kurt_down ? 20_000 : 60_000;
    const poll = window.setInterval(() => void load(), ms);
    return () => window.clearInterval(poll);
  }, [load, status?.at_risk, status?.kurt_down]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("statsify:plays-synced", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("statsify:plays-synced", refresh);
    };
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
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-spotify-light-gray">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-spotify-green" />
        Racha…
      </div>
    );
  }

  const down = mood.tone === "down";
  const risk = mood.tone === "risk";
  const recent = status.recent.slice(-7);
  const detail = down
    ? "Kurt se disparó"
    : risk
      ? `se dispara en ${formatUntilShot(remainingMs)}`
      : "Kurt está a salvo";

  return (
    <Link
      href="/kurt"
      className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.05]"
    >
      {down ? (
        <Skull className="h-3.5 w-3.5 shrink-0 text-rose-300" />
      ) : (
        <Flame className={cn("h-3.5 w-3.5 shrink-0", risk ? "text-amber-300" : "text-spotify-green")} />
      )}
      <span className="min-w-0 truncate text-xs text-white/80">
        <span className="font-medium text-white">
          {status.current_streak} {status.current_streak === 1 ? "día" : "días"}
        </span>
        <span className="text-white/45"> · {detail}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5" aria-hidden>
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
