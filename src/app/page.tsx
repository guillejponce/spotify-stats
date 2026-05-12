"use client";

import { useState, useEffect, useCallback } from "react";
import { NowPlayingCard } from "@/components/now-playing/now-playing-card";
import { StatCard } from "@/components/stats/stat-card";
import { TopItemsList } from "@/components/stats/top-items-list";
import { TimeFilterControl } from "@/components/stats/time-filter";
import { ListeningChart } from "@/components/charts/listening-chart";
import { HourlyChart } from "@/components/charts/hourly-chart";
import { PlatformChart } from "@/components/charts/platform-chart";
import { MonthRankChart } from "@/components/charts/month-rank-chart";
import { YearBarChart } from "@/components/charts/year-bar-chart";
import { Heatmap } from "@/components/charts/heatmap";
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
} from "lucide-react";
import {
  cn,
  formatMs,
  formatNumber,
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
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMs: 0,
    playCount: 0,
    sessionCount: 0,
    topTracks: [] as TopItem[],
    topArtists: [] as TopItem[],
    topAlbums: [] as TopItem[],
    listeningOverTime: [] as ListeningTimeData[],
    hourlyData: [] as HourlyData[],
    platformData: [] as { platform: string; play_count: number; ms_played: number }[],
    heatmapData: [] as { date: string; count: number; ms_played: number }[],
    monthsTop: [] as MonthBucket[],
    yearsBreakdown: [] as YearBucket[],
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("filter", timeFilter.filter);
      if (timeFilter.year) params.set("year", String(timeFilter.year));
      if (timeFilter.month) params.set("month", String(timeFilter.month));

      const response = await fetch(`/api/stats?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
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
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /** Periodically pull Spotify “Recently played” into `plays` (server). Complements one-time JSON import. */
  useEffect(() => {
    const run = async () => {
      try {
        const r = await syncSpotifyRecentFromServer();
        if (r.ok) {
          void fetchStats();
        }
      } catch {
        // sin tokens o error temporal
      }
    };
    void run();
    const id = window.setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchStats]);

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


  return (
    <div className="space-y-8">
      {oauthBanner && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <span>{oauthBanner}</span>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-spotify-light-gray">
            Resumen de tu escucha; tiempos mostrados para Chile.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {spotifySession && (
            <div className="flex items-center gap-2 text-xs text-spotify-light-gray">
              {spotifySession.connected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-spotify-green" />
                  <span>
                    Spotify vinculado
                    {spotifySession.access_token_expired &&
                      " (access expirado; se renueva solo al usar la API si hay refresh token)"}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-spotify-light-gray/80">
                    Sin tokens en BD
                    {spotifySession.reason
                      ? ` — ${spotifySession.reason}`
                      : ""}{" "}
                    · tabla <code className="text-spotify-green">spotify_tokens</code>
                  </span>
                </>
              )}
            </div>
          )}
          <a
            href="/api/spotify/auth"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <LogIn className="mr-2 h-4 w-4" />
            {spotifySession?.connected ? "Reconectar Spotify" : "Connect Spotify"}
          </a>
        </div>
      </div>

      <div className="max-w-md">
        <NowPlayingCard />
      </div>

      <TimeFilterControl variant="dashboard" value={timeFilter} onChange={setTimeFilter} />
      <p className="-mt-4 text-xs text-spotify-light-gray/65">
        Las tarjetas rápidas usan ventanas móviles (desde ahora hacia atrás). El conteo grande de
        reproducciones es{" "}
        <span className="text-spotify-light-gray">cada fila en `plays`</span> (segmentos)—igual que
        las barras por día / mes / año. Las listas Top usan{" "}
        <span className="text-spotify-light-gray">sesiones</span> (mismo tema con pausas cortas
        cuenta una vez). Todo agrupado en{" "}
        <span className="text-spotify-light-gray">{CHILE_TIMEZONE_LABEL}</span>.         El mapa térmico muestra el{" "}
        <span className="text-spotify-light-gray">año civil actual en Chile</span>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tiempo de escucha"
          value={formatMs(stats.totalMs)}
          subtitle={formatListeningTimeSubtitle(stats.totalMs)}
          icon={Clock}
        />
        <StatCard
          title="Filas reproducidas"
          value={formatNumber(stats.playCount)}
          subtitle={
            stats.sessionCount > 0
              ? `${formatNumber(stats.sessionCount)} sesiones (~15 min mismo tema)`
              : undefined
          }
          icon={Music2}
        />
        <StatCard
          title="Top Artist"
          value={stats.topArtists[0]?.name || "—"}
          subtitle={
            stats.topArtists[0]
              ? `${formatNumber(stats.topArtists[0].play_count)} sesiones`
              : undefined
          }
          icon={Disc3}
        />
        <StatCard
          title="Top Track"
          value={stats.topTracks[0]?.name || "—"}
          subtitle={
            stats.topTracks[0]
              ? `${formatNumber(stats.topTracks[0].play_count)} sesiones`
              : undefined
          }
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListeningChart
          title="Escucha en el tiempo"
          data={stats.listeningOverTime}
          loading={loading}
        />
        <HourlyChart
          title="Horas más activas (Chile)"
          data={stats.hourlyData}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MonthRankChart
          title="Meses con más reproducciones"
          data={stats.monthsTop}
          loading={loading}
        />
        <YearBarChart
          title="Por año"
          data={stats.yearsBreakdown}
          loading={loading}
        />
      </div>

      <Heatmap
        title={`Mapa de escuchas ${timeFilter.year ?? currentCalendarYearChile()} (calendario Chile)`}
        data={stats.heatmapData}
        loading={loading}
        year={timeFilter.year ?? currentCalendarYearChile()}
      />

      <Tabs defaultValue="tracks">
        <TabsList>
          <TabsTrigger value="tracks">Top Tracks</TabsTrigger>
          <TabsTrigger value="artists">Top Artists</TabsTrigger>
          <TabsTrigger value="albums">Top Albums</TabsTrigger>
        </TabsList>
        <TabsContent value="tracks">
          <TopItemsList title="Top Tracks" items={stats.topTracks} loading={loading} />
        </TabsContent>
        <TabsContent value="artists">
          <TopItemsList title="Top Artists" items={stats.topArtists} loading={loading} />
        </TabsContent>
        <TabsContent value="albums">
          <TopItemsList title="Top Albums" items={stats.topAlbums} loading={loading} />
        </TabsContent>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-2">
        <PlatformChart title="Plataforma" data={stats.platformData} loading={loading} />
      </div>
    </div>
  );
}
