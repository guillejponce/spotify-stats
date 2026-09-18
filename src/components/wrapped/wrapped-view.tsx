"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gift, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Heatmap } from "@/components/charts/heatmap";
import { HourlyChart } from "@/components/charts/hourly-chart";
import { MonthRankChart } from "@/components/charts/month-rank-chart";
import { WeekdayChart } from "@/components/charts/weekday-chart";
import { WrappedRaceBoard } from "@/components/wrapped/wrapped-race";
import { WrappedTopList } from "@/components/wrapped/wrapped-top-list";
import {
  formatMs,
  formatReproductionCount,
  formatListeningTimeSubtitle,
} from "@/lib/utils";
import { currentCalendarYearChile } from "@/lib/chile-time";
import type { WrappedPayload } from "@/types/wrapped";

function parseYearParam(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2010 || n > 2100) return fallback;
  return Math.floor(n);
}

export function WrappedView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentYear = currentCalendarYearChile();
  const year = parseYearParam(searchParams.get("year"), currentYear);

  const [data, setData] = useState<WrappedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void fetch(`/api/wrapped?year=${year}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as WrappedPayload & { error?: string };
        if (!res.ok) throw new Error(json.error || "No se pudo cargar");
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const years = useMemo(() => {
    const set = new Set(data?.available_years ?? [currentYear]);
    set.add(currentYear);
    set.add(year);
    return Array.from(set).sort((a, b) => b - a);
  }, [data?.available_years, currentYear, year]);

  const selectYear = (next: number) => {
    if (next === year) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === currentYear) params.delete("year");
    else params.set("year", String(next));
    const qs = params.toString();
    router.replace(qs ? `/wrapped?${qs}` : "/wrapped");
  };

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
        {error || "Armando tu Wrapped del año…"}
      </div>
    );
  }

  const vs = data.vs_last_year;
  const vsUp = vs && vs.ms_delta_pct != null && vs.ms_delta_pct > 0;
  const vsDown = vs && vs.ms_delta_pct != null && vs.ms_delta_pct < 0;
  const live = data.is_current_year;
  const trackCount = data.races.track.items.length;
  const artistCount = data.races.artist.items.length;

  return (
    <div className="relative space-y-6 sm:space-y-8">
      {busy && (
        <div className="pointer-events-none absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] text-white/70">
          <Loader2 className="h-3 w-3 animate-spin text-spotify-green" />
          Cargando {year}…
        </div>
      )}

      <header className="pl-12 lg:pl-0">
        <div className="flex items-center gap-2 text-spotify-green">
          <Gift className="h-5 w-5" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            {live ? "Wrapped en curso" : `Premios ${data.year}`}
          </p>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {data.year}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-spotify-light-gray">
          {live
            ? "La carrera a canción, álbum y artista del año, con el avance de tus listens en Chile. Se actualiza con lo que ya escuchaste."
            : "Así quedaron canción, álbum y artista del año, con las mismas stats del Wrapped. Podés volver a cualquier temporada."}
        </p>
        <div className="mt-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {years.map((y) => {
            const active = y === year;
            return (
              <button
                key={y}
                type="button"
                onClick={() => selectYear(y)}
                className={
                  active
                    ? "shrink-0 rounded-full bg-spotify-green px-3 py-1.5 text-sm font-semibold text-black"
                    : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/[0.08] hover:text-white"
                }
              >
                {y}
                {y === currentYear ? " · ahora" : ""}
              </button>
            );
          })}
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-spotify-green/15 via-white/[0.03] to-transparent p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm text-white/80">
            {live
              ? `Día ${data.progress.elapsed_days} de ${data.progress.total_days}`
              : `Año cerrado · ${data.progress.total_days} días`}
          </p>
          <p className="text-xs tabular-nums text-white/45">
            {live
              ? `${data.progress.pct}% · quedan ${data.progress.remaining_days} días`
              : "100%"}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-spotify-green"
            style={{
              width: `${Math.min(100, Math.max(2, live ? data.progress.pct : 100))}%`,
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat
            label="Escucha"
            value={formatMs(data.totals.ms_played)}
            hint={formatListeningTimeSubtitle(data.totals.ms_played)}
          />
          <HeroStat
            label="Repros"
            value={formatReproductionCount(data.totals.play_count)}
          />
          <HeroStat
            label="Días con música"
            value={formatReproductionCount(data.totals.listen_days)}
          />
          <HeroStat
            label={live ? "Ritmo a dic" : "Total año"}
            value={formatMs(live ? data.totals.projected_ms : data.totals.ms_played)}
            hint={live ? "si mantenés el ritmo" : undefined}
          />
        </div>
        {vs && (
          <p className="mt-3 text-xs text-white/50">
            {live
              ? `Contra ${vs.last_year} a esta altura: `
              : `Contra ${vs.last_year} (año completo): `}
            <span
              className={
                vsUp
                  ? "text-spotify-green"
                  : vsDown
                    ? "text-rose-300"
                    : "text-white/70"
              }
            >
              {vs.ms_delta_pct == null
                ? "sin base para comparar"
                : `${vs.ms_delta_pct > 0 ? "+" : ""}${vs.ms_delta_pct}% tiempo`}
            </span>
            {" · "}
            {live
              ? `${formatReproductionCount(vs.play_count)} repros el año pasado YTD`
              : `${formatReproductionCount(vs.play_count)} repros en ${vs.last_year}`}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/45">
          {live ? "La carrera" : "Los premios"}
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <WrappedRaceBoard race={data.races.track} />
          <WrappedRaceBoard race={data.races.album} />
          <WrappedRaceBoard race={data.races.artist} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/45">
          Ranking completo
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <WrappedTopList
            key={`tracks-${data.year}`}
            title="Top canciones"
            hint={
              trackCount >= 100
                ? `Las 100 más escuchadas de ${data.year}`
                : `${trackCount} canción${trackCount === 1 ? "" : "es"} de ${data.year}`
            }
            items={data.races.track.items}
          />
          <WrappedTopList
            key={`artists-${data.year}`}
            title="Top artistas"
            hint={
              artistCount >= 100
                ? `Los 100 más escuchados de ${data.year}`
                : `${artistCount} artista${artistCount === 1 ? "" : "s"} de ${data.year}`
            }
            items={data.races.artist.items}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/45">
          {live ? "Cómo viene el año" : `Cómo fue ${data.year}`}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.facts.map((fact) => (
            <Card key={fact.label} className="border-white/[0.06]">
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  {fact.label}
                </p>
                <p className="mt-1 text-lg font-semibold leading-tight text-white">
                  {fact.value}
                </p>
                {fact.hint && (
                  <p className="mt-0.5 text-xs text-white/40">{fact.hint}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthRankChart title={`Meses ${data.year}`} data={data.months} />
        <Card className="border-white/[0.06]">
          <CardContent className="p-4 sm:p-5">
            <h3 className="text-base font-semibold text-white sm:text-lg">
              Días más escuchados
            </h3>
            <p className="mt-0.5 text-xs text-white/40">
              {live
                ? `Los picos del ${data.year} hasta ahora`
                : `Los picos de ${data.year}`}
            </p>
            {data.top_days.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/45">
                {live
                  ? "Todavía no hay un día que se escape."
                  : "No hubo un día que se escape."}
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {data.top_days.map((day, i) => (
                  <li
                    key={day.date}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 text-xs tabular-nums text-white/30">
                        {i + 1}
                      </span>
                      <span className="truncate capitalize text-white">
                        {day.label}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-white/55">
                      {formatMs(day.ms_played)}
                      <span className="ml-2 text-white/30">
                        {formatReproductionCount(day.play_count)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HourlyChart title="Horas del año" data={data.hourly} />
        <WeekdayChart title="Días de la semana" data={data.daily} />
      </div>

      <Heatmap
        title={`Mapa ${data.year}`}
        data={data.heatmap}
        year={data.year}
      />
    </div>
  );
}

function HeroStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-white sm:text-2xl">
        {value}
      </p>
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}
