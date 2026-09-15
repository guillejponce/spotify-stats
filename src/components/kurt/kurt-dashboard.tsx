"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Loader2, Skull } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatChileCalendarDayLong } from "@/lib/chile-time";
import type { KurtStatus } from "@/lib/kurt-types";
import { PushNotificationsToggle } from "@/components/push-notifications-toggle";

type Mood = {
  headline: string;
  subtitle: string;
  tone: "alive" | "risk" | "down";
};

type Payload = {
  ok: boolean;
  status?: KurtStatus;
  mood?: Mood;
  error?: string;
};

function weekdayShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es", {
    weekday: "narrow",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function KurtDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kurt/status", { cache: "no-store" });
      const json = (await res.json()) as Payload;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo cargar la racha");
      }
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (!data?.status || !data.mood) {
    return (
      <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin" />
        {error || "Contando días sin disparos…"}
      </div>
    );
  }

  const { status, mood } = data;
  const down = mood.tone === "down";
  const risk = mood.tone === "risk";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pl-12 lg:pl-0">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-spotify-light-gray">
            Kurt CubAIn
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {mood.headline}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-spotify-light-gray">
            {mood.subtitle}
          </p>
        </div>
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full",
            down
              ? "bg-rose-500/15 text-rose-400"
              : risk
                ? "bg-amber-400/15 text-amber-300"
                : "bg-spotify-green/15 text-spotify-green",
          )}
        >
          {down ? <Skull className="h-8 w-8" /> : <Flame className="h-8 w-8" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-wider text-spotify-light-gray">
              Días sin disparos
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-white">
              {status.current_streak}
            </p>
            <p className="mt-1 text-xs text-spotify-light-gray/60">
              {status.listened_today
                ? "Hoy ya hay música. Kurt respira."
                : status.at_risk
                  ? `Quedan ~${Math.max(1, Math.round(status.hours_left_today))} h`
                  : "Racha en 0. Un tema lo levanta."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-wider text-spotify-light-gray">
              Racha más larga
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-white">
              {status.longest_streak}
            </p>
            <p className="mt-1 text-xs text-spotify-light-gray/60">
              {status.incidents} corte{status.incidents === 1 ? "" : "s"} en la
              historia
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-wider text-spotify-light-gray">
              Días con música
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-white">
              {status.total_listen_days}
            </p>
            <p className="mt-1 text-xs text-spotify-light-gray/60">
              {status.last_listen_day
                ? `Último: ${formatChileCalendarDayLong(status.last_listen_day)}`
                : "Sin plays de 30s+"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <p className="mb-4 text-sm font-medium text-white">Últimas 4 semanas</p>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {status.recent.map((day) => {
              const isToday = day.date === status.today;
              return (
                <div
                  key={day.date}
                  title={`${day.date}${day.listened ? " · música" : " · silencio"}`}
                  className={cn(
                    "aspect-square rounded-md",
                    day.listened
                      ? "bg-spotify-green"
                      : isToday
                        ? "animate-pulse bg-amber-400/70"
                        : "bg-white/15",
                    isToday && "ring-2 ring-white/70 ring-offset-2 ring-offset-spotify-dark-gray",
                  )}
                />
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-7 text-center text-[10px] text-spotify-light-gray/50">
            {status.recent.slice(-7).map((day) => (
              <span key={`w-${day.date}`}>{weekdayShort(day.date)}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-spotify-light-gray/55">
            Un día cuenta si hay al menos una reproducción de 30 segundos. Un skip
            no salva a Kurt. Zona: Chile.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agent" className={buttonVariants()}>
          Hablar con Kurt
        </Link>
        <p className="text-xs text-spotify-light-gray/60">
          Si no escuchas un día, la racha cae a 0 y Kurt se dispara. Estilo
          Duolingo: amenaza de cartón, no de verdad.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4 sm:p-5">
          <p className="text-sm font-medium text-white">Amenazas push</p>
          <p className="text-xs text-spotify-light-gray/60">
            Kurt avisa al mediodía, de noche y a última hora si hoy todavía no hay
            música. En iPhone hay que abrir la app desde la pantalla de inicio.
          </p>
          <PushNotificationsToggle compact />
        </CardContent>
      </Card>
    </div>
  );
}
