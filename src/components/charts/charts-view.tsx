"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Guitar,
  Loader2,
  Minus,
  Plus,
  Radio,
  Search,
  ExternalLink,
  PlayCircle,
  Pencil,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChartPreview } from "@/components/charts/chart-preview";
import {
  parseChordPro,
  searchUrls,
  transposeKey,
} from "@/lib/chordpro";
import { cn } from "@/lib/utils";
import type { ChartSearchHit, ChartTrack, SongChart } from "@/types/charts";

type NowPlaying = {
  track_id: string | null;
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  is_playing: boolean;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ChartsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pinnedId = searchParams.get("track_id");

  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [track, setTrack] = useState<ChartTrack | null>(null);
  const [chart, setChart] = useState<SongChart | null>(null);
  const [recent, setRecent] = useState<SongChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [transpose, setTranspose] = useState(0);
  const [fontSize, setFontSize] = useState(15);
  const [autoscroll, setAutoscroll] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChartSearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skeletonBusy, setSkeletonBusy] = useState(false);
  const [harmony, setHarmony] = useState<{ key: string | null; tempo: number | null }>({
    key: null,
    tempo: null,
  });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounced(query, 280);

  const activeTrackId = pinnedId || nowPlaying?.track_id || null;

  const headerTitle =
    track?.name || nowPlaying?.track_name || chart?.title || null;
  const headerArtist =
    track?.artist_name || nowPlaying?.artist_name || chart?.artist_name || null;
  const headerArt = track?.image_url || nowPlaying?.album_art_url || null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { nowPlaying: NowPlaying | null };
        if (!cancelled) setNowPlaying(json.nowPlaying);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const loadChart = useCallback(async (trackId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = trackId
        ? `/api/charts?track_id=${encodeURIComponent(trackId)}`
        : "/api/charts";
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json()) as {
        chart: SongChart | null;
        track: ChartTrack | null;
        recent?: SongChart[];
        key?: string | null;
        tempo?: number | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "No se pudo cargar");
      setChart(json.chart);
      setTrack(json.track);
      setHarmony({ key: json.key ?? null, tempo: json.tempo ?? null });
      if (!trackId) setRecent(json.recent ?? []);
      setDraft(json.chart?.content ?? "");
      setEditing(!json.chart);
      setTranspose(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChart(activeTrackId);
  }, [activeTrackId, loadChart]);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/charts/search?q=${encodeURIComponent(debouncedQuery.trim())}`)
      .then(async (res) => {
        const json = (await res.json()) as { tracks?: ChartSearchHit[] };
        if (!cancelled) setHits(json.tracks ?? []);
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    if (!autoscroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    const id = window.setInterval(() => {
      el.scrollTop += 1;
    }, 50);
    return () => window.clearInterval(id);
  }, [autoscroll]);

  const parsed = useMemo(() => parseChordPro(draft || chart?.content || ""), [draft, chart]);
  const draftLooksGuessed = /esqueleto tentativo/i.test(draft || chart?.content || "");
  const sourceKey = draftLooksGuessed
    ? harmony.key
    : parsed.key ?? chart?.original_key ?? harmony.key;
  const sourceTempo = draftLooksGuessed
    ? harmony.tempo
    : parsed.tempo ?? harmony.tempo;
  const displayKey = transposeKey(sourceKey ?? null, transpose);
  const links = searchUrls(headerTitle ?? "", headerArtist ?? "");

  const selectTrack = (id: string) => {
    setSearchOpen(false);
    setQuery("");
    router.replace(`/charts?track_id=${encodeURIComponent(id)}`);
  };

  const followLive = () => {
    router.replace("/charts");
  };

  const requestSkeleton = useCallback(async () => {
    if (!headerTitle) return;
    setSkeletonBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/charts/skeleton", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: headerTitle,
          artist: headerArtist ?? "",
          trackId: activeTrackId,
        }),
      });
        const json = (await res.json()) as {
          content?: string;
          key?: string | null;
          tempo?: number | null;
          error?: string;
        };
        if (!res.ok || !json.content) {
          throw new Error(json.error || "No se pudo armar la hoja");
        }
        setDraft(json.content);
        setHarmony({ key: json.key ?? null, tempo: json.tempo ?? null });
        setEditing(true);
        setTranspose(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSkeletonBusy(false);
    }
  }, [activeTrackId, headerArtist, headerTitle]);

  const save = async () => {
    if (!activeTrackId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/charts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: activeTrackId,
          content: draft,
          title: headerTitle,
          artistName: headerArtist,
          originalKey: parsed.key || chart?.original_key,
          capo: parsed.capo ?? chart?.capo ?? 0,
        }),
      });
      const json = (await res.json()) as { chart?: SongChart; error?: string };
      if (!res.ok || !json.chart) throw new Error(json.error || "No se pudo guardar");
      setChart(json.chart);
      setDraft(json.chart.content);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const live = !pinnedId;

  return (
    <div className="space-y-5">
      <header className="pl-12 lg:pl-0">
        <div className="flex items-center gap-2 text-spotify-green">
          <Guitar className="h-5 w-5" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            Cancionero
          </p>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Cifras</h1>
        <p className="mt-1 max-w-xl text-sm text-spotify-light-gray">
          Tono y BPM medidos (no inventados). Los acordes los pegás vos.
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Buscar en tu catálogo…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-spotify-green/50"
        />
        {searchOpen && hits.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-spotify-dark-gray shadow-xl">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => selectTrack(hit.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.06]"
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/5">
                    {hit.image_url ? (
                      <Image src={hit.image_url} alt="" fill sizes="36px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Guitar className="h-3.5 w-3.5 text-white/30" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{hit.name}</span>
                    <span className="block truncate text-[11px] text-white/40">
                      {hit.artist_name}
                    </span>
                  </span>
                  {hit.has_chart && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-spotify-green">
                      Cifra
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={followLive}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
            live
              ? "bg-spotify-green text-black"
              : "border border-white/10 text-white/70 hover:bg-white/[0.06]",
          )}
        >
          <Radio className="h-3.5 w-3.5" />
          Seguir en vivo
        </button>
        {nowPlaying?.track_name && (
          <span className="text-xs text-white/40">
            {nowPlaying.is_playing ? "Suena" : "Pausado"}: {nowPlaying.track_name}
          </span>
        )}
      </div>

      {!activeTrackId && !loading ? (
        <EmptyCatalog recent={recent} onPick={selectTrack} />
      ) : (
        <Card className="border-white/[0.06]">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5">
                {headerArt ? (
                  <Image src={headerArt} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <Guitar className="h-5 w-5 text-white/30" />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-white">
                  {headerTitle || "Cargando…"}
                </h2>
                <p className="truncate text-sm text-white/50">{headerArtist}</p>
                <p className="mt-1 text-[11px] tabular-nums text-white/35">
                  {displayKey || sourceTempo != null ? (
                    <>
                      Tono {displayKey || "—"}
                      {transpose !== 0 ? ` · ${transpose > 0 ? "+" : ""}${transpose}` : ""}
                      {sourceTempo != null ? ` · ${sourceTempo} BPM` : ""}
                      {(parsed.capo ?? chart?.capo ?? 0) > 0
                        ? ` · capo ${(parsed.capo ?? chart?.capo)!}`
                        : ""}
                    </>
                  ) : (
                    "Sin tono/BPM medido"
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ControlGroup>
                <IconBtn
                  label="Bajar un semitono"
                  onClick={() => setTranspose((n) => n - 1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </IconBtn>
                <span className="min-w-[4.5rem] text-center text-[11px] tabular-nums text-white/60">
                  {transpose === 0 ? "tono" : `${transpose > 0 ? "+" : ""}${transpose}`}
                </span>
                <IconBtn
                  label="Subir un semitono"
                  onClick={() => setTranspose((n) => n + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </IconBtn>
              </ControlGroup>
              <ControlGroup>
                <IconBtn
                  label="Letra más chica"
                  onClick={() => setFontSize((n) => Math.max(12, n - 1))}
                >
                  A−
                </IconBtn>
                <IconBtn
                  label="Letra más grande"
                  onClick={() => setFontSize((n) => Math.min(22, n + 1))}
                >
                  A+
                </IconBtn>
              </ControlGroup>
              <Button
                size="sm"
                variant="secondary"
                disabled={skeletonBusy || !headerTitle}
                onClick={() => {
                  const hasWords = /\][^\n{\[]*[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(
                    draft,
                  );
                  if (
                    hasWords &&
                    !window.confirm("Esto reemplaza el borrador. ¿Seguimos?")
                  ) {
                    return;
                  }
                  void requestSkeleton();
                }}
              >
                {skeletonBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                {chart || draft.trim() ? "Recargar tono y BPM" : "Cargar tono y BPM"}
              </Button>
              <button
                type="button"
                onClick={() => setAutoscroll((v) => !v)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  autoscroll
                    ? "bg-spotify-green text-black"
                    : "border border-white/10 text-white/70",
                )}
              >
                Autoscroll
              </button>
              {!editing ? (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => void save()} disabled={saving || !activeTrackId}>
                    {saving ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Guardar
                  </Button>
                  {chart && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDraft(chart.content);
                        setEditing(false);
                      }}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Outbound href={links.cifraClub} label="Cifra Club" />
              <Outbound href={links.ultimateGuitar} label="Ultimate Guitar" />
              <Outbound href={links.genius} label="Genius" />
            </div>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
                Cargando cifra…
              </div>
            ) : (
              <>
                {editing && (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`{title: ${headerTitle || "Tema"}}\n{artist: ${headerArtist || "Artista"}}\n{key: Em}\n{tempo: 168}\n\nPegá acá los acordes (y la letra si querés)`}
                    className="min-h-[12rem] w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-sm text-white placeholder:text-white/25 outline-none focus:border-spotify-green/40"
                  />
                )}

                {!chart && !draft.trim() && !editing ? (
                  <EmptyChart title={headerTitle} artist={headerArtist} />
                ) : (
                  <div
                    ref={scrollerRef}
                    className="max-h-[min(40rem,70vh)] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 p-4"
                  >
                    <ChartPreview
                      content={draft || chart?.content || ""}
                      transpose={transpose}
                      fontSize={fontSize}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyCatalog({
  recent,
  onPick,
}: {
  recent: SongChart[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-white/[0.06]">
        <CardContent className="p-6 text-center">
          <PlayCircle className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-2 text-sm text-white/60">
            No hay nada sonando. Poné un tema o buscá en tu catálogo.
          </p>
        </CardContent>
      </Card>
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
            Últimas cifras
          </h2>
          <ul className="space-y-1">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item.track_id)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/[0.05]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{item.title}</span>
                    <span className="block truncate text-[11px] text-white/40">
                      {item.artist_name}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyChart({
  title,
  artist,
}: {
  title: string | null;
  artist: string | null;
}) {
  const links = searchUrls(title ?? "", artist ?? "");
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
      <p className="text-sm text-white/60">Todavía no hay cifra para este tema.</p>
      <p className="mt-1 text-xs text-white/40">
        Cargar tono y BPM deja las secciones vacías. Los acordes los pegás vos.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Outbound href={links.cifraClub} label="Cifra Club" />
        <Outbound href={links.ultimateGuitar} label="Ultimate Guitar" />
        <Outbound href={links.genius} label="Genius" />
      </div>
    </div>
  );
}

function Outbound({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function ControlGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-full border border-white/10">
      {children}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
    >
      {children}
    </button>
  );
}
