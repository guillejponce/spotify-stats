"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Music2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/friends/user-avatar";

type Listening = {
  is_playing: boolean;
  updated_at: string;
  track_name: string;
  artist_name: string | null;
  album_art_url: string | null;
};

type Row = {
  profile: { id: string; display_name: string | null; avatar_url: string | null };
  listening: Listening | null;
};

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

export function FriendsListeningCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/friends/listening", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error");
        if (!cancelled) {
          setRows(data.friends ?? []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      }
    }

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <Card className="flex min-h-0 flex-col border-white/[0.06] bg-white/[0.03] shadow-none lg:h-full lg:border-white/[0.08] lg:bg-spotify-dark-gray lg:shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col p-3 lg:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
            Amigos
          </p>
          <Link href="/friends" className="text-xs text-spotify-light-gray hover:text-white">
            Ver todos
          </Link>
        </div>

        {rows == null && !error && (
          <div className="flex flex-1 items-center gap-2 text-sm text-spotify-light-gray">
            <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
            Viendo qué suena…
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {rows && rows.length === 0 && (
          <div className="flex flex-1 flex-col justify-center gap-1">
            <p className="text-sm text-white">Nadie por acá todavía</p>
            <p className="text-xs text-spotify-light-gray">
              Cuando tengas amigos, vas a ver qué están escuchando.
            </p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] lg:block lg:min-h-0 lg:flex-1 lg:space-y-0.5 lg:overflow-y-auto lg:overflow-x-hidden">
            {rows.map((row) => {
              const name = row.profile.display_name ?? "Sin nombre";
              const live = row.listening?.is_playing;
              return (
                <li key={row.profile.id} className="w-[15rem] shrink-0 lg:w-auto">
                  <Link
                    href={`/u/${row.profile.id}`}
                    className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-2 py-1.5 hover:bg-white/10 lg:bg-transparent lg:px-1.5"
                  >
                    <UserAvatar url={row.profile.avatar_url} name={name} className="h-8 w-8 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs text-white/70">{name}</span>
                        {live && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-spotify-green" aria-label="Escuchando ahora" />
                        )}
                      </span>
                      {row.listening ? (
                        <span className="block truncate text-sm text-white">
                          {row.listening.track_name}
                          {row.listening.artist_name ? (
                            <span className="text-spotify-light-gray"> · {row.listening.artist_name}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="block truncate text-sm text-spotify-light-gray">Sin actividad</span>
                      )}
                      {row.listening && !live && (
                        <span className="block truncate text-[11px] text-white/40">
                          {when(row.listening.updated_at)}
                        </span>
                      )}
                    </span>
                    {row.listening?.album_art_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.listening.album_art_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/5">
                        <Music2 className="h-3.5 w-3.5 text-white/30" />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
