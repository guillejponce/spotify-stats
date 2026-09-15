"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { NowPlayingCard } from "@/components/now-playing/now-playing-card";
import { StatCard } from "@/components/stats/stat-card";
import { TopItemsList } from "@/components/stats/top-items-list";
import { TimeFilterControl } from "@/components/stats/time-filter";
import { DashboardPeriodBar } from "@/components/stats/dashboard-period-bar";
import { KurtStreakCard } from "@/components/kurt/kurt-streak-card";
import { ListeningInsights } from "@/components/stats/listening-insights";
import {
  StatsSyncBanner,
  type RecentSyncPhase,
} from "@/components/stats/stats-sync-banner";
import { ListeningChart } from "@/components/charts/listening-chart";
import { HourlyChart } from "@/components/charts/hourly-chart";
import { MonthRankChart } from "@/components/charts/month-rank-chart";
import { YearBarChart } from "@/components/charts/year-bar-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { WeekdayChart } from "@/components/charts/weekday-chart";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Music2,
  Clock,
  Disc3,
  TrendingUp,
  LogIn,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import {
  cn,
  formatMs,
  formatReproductionCount,
  formatListeningTimeSubtitle,
} from "@/lib/utils";
import type {
  TimeFilterParams,
  TopItem,
  ListeningTimeData,
  HourlyData,
  MonthBucket,
  YearBucket,
} from "@/types/database";
import { syncSpotifyRecentFromServer } from "@/actions/spotify-sync";
import {
  CHILE_TIMEZONE_LABEL,
  currentCalendarYearChile,
} from "@/lib/chile-time";

export default function DashboardPage() {
  const statsHydratedRef = useRef(false);
  const fetchStatsRef = useRef(async () => {});
  const hourlySectionRef = useRef<HTMLDivElement>(null);
  const weekdaySectionRef = useRef<HTMLDivElement>(null);

  const [timeFilter, setTimeFilter] = useState<TimeFilterParams>({
    filter: "all",
  });
  const [spotifySession, setSpotifySession] = useState<{
    connected: boolean;
    access_token_expired?: boolean;
    expires_at?: string;
    reason?: string;
  } | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  /** Skeleton / bloqueo solo en la primera carga; los cambios de filtro refrescan datos sin vaciar todo. */
  const [blockingLoad, setBlockingLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<RecentSyncPhase>("idle");
  const [syncInserted, setSyncInserted] = useState(0);
  const [highlightHour, setHighlightHour] = useState<number | null>(null);
  const [highlightWeekday, setHighlightWeekday] = useState<number | null>(null);
  const [stats, setStats] = useState({
    totalMs: 0,
    playCount: 0,
    sessionCount: 0,
    topTracks: [] as TopItem[],
    topArtists: [] as TopItem[],
    topAlbums: [] as TopItem[],
    listeningOverTime: [] as ListeningTimeData[],
    hourlyData: [] as HourlyData[],
    heatmapData: [] as { date: string; count: number; ms_played: number }[],
    monthsTop: [] as MonthBucket[],
    yearsBreakdown: [] as YearBucket[],
  });

  const fetchStats = useCallback(async () => {
    const isFirstHydration = !statsHydratedRef.current;
    if (isFirstHydration) setBlockingLoad(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("filter", timeFilter.filter);
      if (timeFilter.year) params.set("year", String(timeFilter.year));
      if (timeFilter.month) params.set("month", String(timeFilter.month));

      const response = await fetch(`/api/stats?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        statsHydratedRef.current = true;
        setStats((prev) => ({
          ...prev,
          ...data,
          monthsTop: Array.isArray(data.monthsTop) ? data.monthsTop : [],
          yearsBreakdown: Array.isArray(data.yearsBreakdown)
            ? data.yearsBreakdown
            : [],
        }));
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setBlockingLoad(false);
      setRefreshing(false);
    }
  }, [timeFilter]);

  fetchStatsRef.current = fetchStats;

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  /** Periodically pull Spotify “Recently played” into `plays` (server). Complements one-time JSON import.
   *  No dependemos de fetchStats aquí para no reiniciar el interval ni duplicar sync al cambiar filtros.
   */
  useEffect(() => {
    let hideTimer: number | undefined;
    const run = async () => {
      setSyncPhase("syncing");
      try {
        const r = await syncSpotifyRecentFromServer();
        if (r.ok) {
          setSyncInserted(r.synced ?? 0);
          setSyncPhase("refreshing");
          await fetchStatsRef.current();
          setSyncPhase("done");
          hideTimer = window.setTimeout(() => setSyncPhase("idle"), 3800);
        } else {
          setSyncPhase("idle");
        }
      } catch {
        setSyncPhase("idle");
      }
    };
    void run();
    const id = window.setInterval(run, 5 * 60 * 1000);
    return () => {
      window.clearInterval(id);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const detail = params.get("detail");
    if (err) {
      setOauthBanner(
        detail
          ? `Spotify OAuth: ${decodeURIComponent(err)} · ${decodeURIComponent(detail)}`
          : `Spotify OAuth: ${decodeURIComponent(err)}`
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetch("/api/spotify/session")
      .then((r) => r.json())
      .then(setSpotifySession)
      .catch(() => setSpotifySession({ connected: false, reason: "fetch_failed" }));
  }, []);

  const connected = Boolean(spotifySession?.connected);

  return (
    <div className="space-y-5 sm:space-y-8">
      {oauthBanner && (
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <span>{oauthBanner}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Tu escucha
          </h1>
          <p className="mt-1 text-sm text-spotify-light-gray">
            Stats en vivo, en hora de Chile.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {spotifySession && connected && (
            <span className="hidden items-center gap-1.5 rounded-full border border-spotify-green/20 bg-spotify-green/10 px-2.5 py-1 text-[11px] font-medium text-spotify-green sm:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Spotify
            </span>
          )}
          <a
            href="/api/spotify/auth"
            className={cn(
              buttonVariants({ variant: connected ? "ghost" : "outline", size: "sm" }),
              "min-h-10 px-3 sm:min-h-0"
            )}
          >
            <LogIn className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {connected ? "Reconectar" : "Connect Spotify"}
            </span>
            <span className="sm:hidden">{connected ? "Cuenta" : "Conectar"}</span>
          </a>
        </div>
      </div>

      <StatsSyncBanner phase={syncPhase} inserted={syncInserted} />

      <NowPlayingCard />

      <KurtStreakCard />

      {!blockingLoad && (
        <ListeningInsights
          hourly={stats.hourlyData}
          overTime={stats.listeningOverTime}
          topArtist={stats.topArtists[0]?.name}
          onHour={(hour) => {
            setHighlightHour(hour);
            hourlySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onWeekday={(weekday) => {
            setHighlightWeekday(weekday);
            weekdaySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      )}

      <DashboardPeriodBar>
        <TimeFilterControl
          variant="dashboard"
          value={timeFilter}
          onChange={setTimeFilter}
          busy={refreshing || syncPhase === "refreshing"}
        />
      </DashboardPeriodBar>

      <details className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-spotify-light-gray/80 [&::-webkit-details-marker]:hidden">
          <span>Cómo se cuentan las stats</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-spotify-light-gray/65">
          Las tarjetas rápidas usan ventanas móviles (desde ahora hacia atrás). El número grande cuenta{" "}
          <span className="text-spotify-light-gray">cada reproducción registrada</span> en la base
          (segmentos de escucha)—igual que las barras por día / mes / año. Las listas Top ordenan por{" "}
          <span className="text-spotify-light-gray">sesiones</span> (~15 min: mismo tema con pausas
          cortas cuenta una vez). Todo agrupado en{" "}
          <span className="text-spotify-light-gray">{CHILE_TIMEZONE_LABEL}</span>. El mapa térmico muestra el{" "}
          <span className="text-spotify-light-gray">año civil actual en Chile</span>.
        </p>
      </details>

      <div className="space-y-5 sm:space-y-8">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="Tiempo de escucha"
            value={formatMs(stats.totalMs)}
            subtitle={formatListeningTimeSubtitle(stats.totalMs)}
            icon={Clock}
            loading={blockingLoad}
          />
          <StatCard
            title="Reproducciones"
            value={formatReproductionCount(stats.playCount)}
            subtitle={
              stats.sessionCount > 0
                ? `${formatReproductionCount(stats.sessionCount)} sesiones (~15 min mismo tema)`
                : undefined
            }
            icon={Music2}
            loading={blockingLoad}
          />
          <StatCard
            title="Top Artist"
            value={stats.topArtists[0]?.name || "—"}
            subtitle={
              stats.topArtists[0]
                ? `${formatReproductionCount(stats.topArtists[0].play_count)} reproducciones`
                : undefined
            }
            icon={Disc3}
            loading={blockingLoad}
          />
          <StatCard
            title="Top Track"
            value={stats.topTracks[0]?.name || "—"}
            subtitle={
              stats.topTracks[0]
                ? `${formatReproductionCount(stats.topTracks[0].play_count)} reproducciones`
                : undefined
            }
            icon={TrendingUp}
            loading={blockingLoad}
          />
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <ListeningChart
            title="Escucha en el tiempo"
            data={stats.listeningOverTime}
            loading={blockingLoad}
          />
          <div ref={hourlySectionRef}>
            <HourlyChart
              title="Horas más activas"
              data={stats.hourlyData}
              loading={blockingLoad}
              highlightHour={highlightHour}
            />
          </div>
        </div>

        <div ref={weekdaySectionRef}>
          <WeekdayChart
            title="Días de la semana"
            data={stats.listeningOverTime}
            loading={blockingLoad}
            highlightWeekday={highlightWeekday}
          />
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <MonthRankChart
            title="Meses con más reproducciones"
            data={stats.monthsTop}
            loading={blockingLoad}
          />
          <YearBarChart
            title="Por año"
            data={stats.yearsBreakdown}
            loading={blockingLoad}
          />
        </div>

        <Heatmap
          title={`Mapa ${timeFilter.year ?? currentCalendarYearChile()}`}
          data={stats.heatmapData}
          loading={blockingLoad}
          year={timeFilter.year ?? currentCalendarYearChile()}
        />

        <Tabs defaultValue="tracks" className="w-full min-w-0">
          <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [touch-action:pan-x]">
            <TabsList className="inline-flex w-max flex-nowrap gap-1">
              <TabsTrigger value="tracks">Top Tracks</TabsTrigger>
              <TabsTrigger value="artists">Top Artists</TabsTrigger>
              <TabsTrigger value="albums">Top Albums</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="tracks" className="mt-3">
            <TopItemsList title="Top Tracks" items={stats.topTracks} loading={blockingLoad} hideTitle />
          </TabsContent>
          <TabsContent value="artists" className="mt-3">
            <TopItemsList title="Top Artists" items={stats.topArtists} loading={blockingLoad} hideTitle />
          </TabsContent>
          <TabsContent value="albums" className="mt-3">
            <TopItemsList title="Top Albums" items={stats.topAlbums} loading={blockingLoad} hideTitle />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
