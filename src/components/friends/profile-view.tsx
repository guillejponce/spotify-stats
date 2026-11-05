"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Flame, Headphones, Loader2, Lock, Music2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/friends/user-avatar";
import { FriendAction } from "@/components/friends/friend-action";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import type { ProfilePeriod, ProfileView as ProfileViewData } from "@/lib/friends";
import type { TopItem } from "@/types/database";

const PERIODS: { id: ProfilePeriod; label: string }[] = [
  { id: "all", label: "Siempre" },
  { id: "year", label: "Este año" },
  { id: "last_month", label: "Últimos 30 días" },
];

function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function productLabel(product: string | null): string | null {
  if (!product) return null;
  if (product === "premium") return "Premium";
  if (product === "free" || product === "open") return "Free";
  return product.charAt(0).toUpperCase() + product.slice(1);
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

function TopList({ title, items }: { title: string; items: TopItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-spotify-light-gray">Sin datos en este período.</p>}
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-spotify-light-gray">{i + 1}</span>
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/10">
                <Music2 className="h-4 w-4 text-spotify-light-gray" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{item.name}</p>
              <p className="text-xs text-spotify-light-gray">
                {formatReproductionCount(item.play_count)} reproducciones
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Flame }) {
  return (
    <div className="rounded-xl bg-spotify-dark-gray p-4 ring-1 ring-white/5">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-spotify-light-gray">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

export function ProfileView({ userId }: { userId: string }) {
  const [period, setPeriod] = useState<ProfilePeriod>("all");
  const [view, setView] = useState<ProfileViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}?period=${period}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setView(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    load();
  }, [load]);

  if (!view) {
    return error ? (
      <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>
    ) : (
      <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const { profile, relation, stats, listening } = view;
  const meta = [
    countryName(profile.country),
    productLabel(profile.product),
    profile.followers != null
      ? `${profile.followers.toLocaleString("es-CL")} ${profile.followers === 1 ? "seguidor" : "seguidores"}`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar url={profile.avatar_url} name={profile.display_name} className="h-20 w-20 text-2xl" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-white">{profile.display_name ?? "Sin nombre"}</h1>
            {meta.length > 0 && <p className="text-sm text-spotify-light-gray">{meta.join(" · ")}</p>}
            {profile.spotify_url && (
              <a
                href={profile.spotify_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-spotify-green hover:underline"
              >
                Ver en Spotify <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <FriendAction userId={profile.id} relation={relation} onChange={load} onError={setError} />
      </div>

      {!stats ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-spotify-light-gray">
            <Lock className="h-5 w-5 shrink-0" />
            {relation === "incoming"
              ? "Te mandó una solicitud. Acéptala para ver sus estadísticas."
              : relation === "outgoing"
                ? "Le mandaste una solicitud. Cuando la acepte vas a ver sus estadísticas."
                : "Agrégalo como amigo para ver sus estadísticas."}
          </CardContent>
        </Card>
      ) : (
        <>
          {listening && (
            <div className="flex items-center gap-3 rounded-xl bg-spotify-dark-gray p-3 ring-1 ring-white/5">
              {listening.album_art_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listening.album_art_url} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-white/10">
                  <Music2 className="h-5 w-5 text-spotify-light-gray" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs", listening.is_playing ? "text-spotify-green" : "text-spotify-light-gray")}>
                  {listening.is_playing ? "Escuchando ahora" : `Última canción · ${timeAgo(listening.updated_at)}`}
                </p>
                <p className="truncate text-sm font-medium text-white">{listening.track_name}</p>
                {listening.artist_name && (
                  <p className="truncate text-xs text-spotify-light-gray">{listening.artist_name}</p>
                )}
              </div>
              {listening.spotify_url && (
                <a
                  href={listening.spotify_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir en Spotify"
                  className="text-spotify-light-gray hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  period === p.id
                    ? "bg-white text-black"
                    : "bg-white/5 text-spotify-light-gray hover:bg-white/10 hover:text-white"
                )}
              >
                {p.label}
              </button>
            ))}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-spotify-light-gray" />}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tiempo escuchado" value={formatMs(stats.totalMs)} icon={Headphones} />
            <Stat label="Reproducciones" value={formatReproductionCount(stats.playCount)} icon={Music2} />
            <Stat label="Racha actual" value={`${stats.currentStreak} días`} icon={Flame} />
            <Stat label="Mejor racha" value={`${stats.longestStreak} días`} icon={Flame} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <TopList title="Top artistas" items={stats.topArtists} />
            <TopList title="Top canciones" items={stats.topTracks} />
            <TopList title="Top álbumes" items={stats.topAlbums} />
          </div>
        </>
      )}
    </div>
  );
}
