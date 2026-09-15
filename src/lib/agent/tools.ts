import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { formatInTimeZone } from "date-fns-tz";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  getDashboardBundlePayload,
  getHourlyDistribution,
  getTopAlbums,
  getTopArtists,
  getTopTracks,
} from "@/lib/stats";
import {
  getRatingsDashboard,
  getRatedTracks,
  lookupRatingForPlayingTrack,
} from "@/lib/ratings";
import { fetchTracksLeaderboard } from "@/lib/track-browse";
import {
  fetchArtistPeriodStats,
  fetchArtistProfile,
  fetchArtistsLeaderboard,
  fetchArtistTracksInPeriod,
} from "@/lib/artist-browse";
import { fetchAlbumsLeaderboard } from "@/lib/album-browse";
import { getCurrentlyPlaying } from "@/lib/spotify";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";
import { getKurtStatus, kurtMood } from "@/lib/kurt";
import {
  SpotifyPlayerError,
  addUrisToQueue,
  controlPlayback,
  fetchArtistDiscographyTracks,
  getArtistTopTrackUris,
  getCatalogTrackFacts,
  getPlayerSnapshot,
  hydrateCatalogPopularity,
  resolveTrackQueries,
  searchSpotifyArtist,
  startPlayingContext,
  startPlayingUris,
  toAlbumUri,
  toArtistUri,
} from "@/lib/spotify-player";
import type { TimeFilter, TimeFilterParams, TopItem } from "@/types/database";

export const TOOL_LABELS: Record<string, string> = {
  get_listening_overview: "Revisando tus stats…",
  get_top_items: "Mirando tus tops…",
  search_library: "Buscando en tu historial…",
  inspect_artist: "Zoom al artista…",
  get_calendar_memories: "Abriendo el calendario…",
  get_on_this_day: "Un día como hoy…",
  get_ratings_snapshot: "Mirando tus valoraciones…",
  get_now_playing: "Qué está sonando…",
  get_listening_gap: "Hace cuánto no pone nada…",
  get_kurt_status: "Contando días sin disparos…",
  control_player: "Tocando el reproductor…",
  play_tracks: "Armando la reproducción…",
  find_unheard_tracks: "Cruzando catálogo vs tu historial…",
  inspect_now_playing: "Mirando lo que suena…",
};

const PERIODS = [
  "all",
  "last_week",
  "last_month",
  "last_6_months",
  "year",
  "month",
  "week",
  "day",
] as const;

type Period = (typeof PERIODS)[number];

const periodParam = {
  type: "string" as const,
  enum: [...PERIODS],
  description:
    "Rango. all = toda la vida. year necesita year. month necesita year+month. day usa start_date YYYY-MM-DD (Chile).",
};

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_listening_overview",
      description:
        "Totales de escucha (horas, plays, sesiones), horas del día más activas y breakdown por año.",
      parameters: {
        type: "object",
        properties: {
          period: periodParam,
          year: { type: "integer" },
          month: { type: "integer", description: "1-12" },
          start_date: {
            type: "string",
            description: "YYYY-MM-DD Chile, solo si period=day",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_items",
      description: "Ranking de canciones, artistas o álbumes en un período.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["tracks", "artists", "albums"],
          },
          period: periodParam,
          year: { type: "integer" },
          month: { type: "integer" },
          start_date: { type: "string" },
          limit: { type: "integer", description: "Default 12, max 20" },
        },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_library",
      description:
        "Busca un tema, artista o álbum en el historial de Guille (no es el catálogo global de Spotify).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          kind: {
            type: "string",
            enum: ["all", "tracks", "artists", "albums"],
          },
          period: periodParam,
          year: { type: "integer" },
          month: { type: "integer" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_artist",
      description:
        "Resuelve un artista por nombre en el historial y devuelve cuánto lo escuchó + sus temas top en el período.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          period: periodParam,
          year: { type: "integer" },
          month: { type: "integer" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_memories",
      description:
        "Qué escuchó en un año/mes/día concreto (Chile). day=0 o omitido = el mes entero.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer" },
          month: { type: "integer", description: "1-12" },
          day: { type: "integer", description: "1-31, 0 = mes entero" },
          limit: { type: "integer" },
        },
        required: ["year", "month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_on_this_day",
      description:
        "Recuerdos 'un día como hoy' (o un mes/día dado) en todos los años con data.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "integer" },
          day: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ratings_snapshot",
      description:
        "Valoraciones explícitas 1-10 de Guille: tops, distribución, recientes. Distinto de 'más reproducido'. SIEMPRE usarla si pregunta por ratings. Vacío = no valoró eso; no es falta de acceso.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Filtrar ratings por nombre de tema/artista",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_now_playing",
      description: "Qué está sonando ahora en Spotify, si hay algo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_listening_gap",
      description:
        "Última reproducción, horas de silencio, y las últimas plays. Usar para enojo/nostalgia de abandono.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kurt_status",
      description:
        "Racha estilo Duolingo de Kurt CubAIn: días seguidos con música (Chile), si hoy ya escuchó, horas hasta medianoche, si Kurt está 'down' (racha 0) o en riesgo. Usar si habla de racha, disparos, días sin disparos o si Kurt se va a disparar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "control_player",
      description:
        "Solo transporte: play, pause, next o previous. NO sirve para poner canciones nuevas. Para reproducir o encolar temas concretos usa play_tracks.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["play", "pause", "next", "previous"],
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "play_tracks",
      description:
        "Reproduce o encola en el Spotify de Guille. Temas: queries. ARTISTA entero: campo artist (pon Turnstile, pon este artista). Álbum: URI spotify:album: o URL. Requiere dispositivo activo (app abierta) y Premium.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["replace", "queue"],
            description:
              "replace = empieza esta lista/artista desde cero. queue = las agrega a continuación. Si no hay nada sonando, queue se convierte en replace.",
          },
          queries: {
            type: "array",
            items: { type: "string" },
            description:
              "Temas: 'artista - tema', nombre, o spotify:track:id / URL. También spotify:album: o URL de álbum.",
          },
          artist: {
            type: "string",
            description:
              "Nombre o URI de un artista para ponerlo a sonar (radio/catálogo). Usar si pide 'pon Turnstile' o reproducir un artista, no un tema suelto.",
          },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_unheard_tracks",
      description:
        "Cruza el catálogo oficial de Spotify de un artista (álbumes + singles) con el historial de Guille y devuelve temas que NUNCA aparecen en sus plays. OBLIGATORIA si pregunta qué no ha escuchado, huecos, deep cuts, o recomendaciones de un artista que aún no puso. No adivines: esta tool es la fuente.",
      parameters: {
        type: "object",
        properties: {
          artist: {
            type: "string",
            description: "Nombre del artista, ej. Turnstile",
          },
          limit: {
            type: "integer",
            description: "Cuántos unheard devolver. Default 12, max 20",
          },
        },
        required: ["artist"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_now_playing",
      description:
        "Lo que está sonando ahora + historial/ratings de Guille + ficha de Spotify (fecha de lanzamiento, álbum o single, pista, sello, popularidad 0-100, seguidores, otras ediciones). Usar para 'saber más' o el tema actual. Spotify NO da el total de streams: usa popularity, nunca inventes reproducciones globales.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function hoursFromMs(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function compactTop(
  items: (TopItem & { artist_name?: string })[],
  limit: number,
) {
  return items.slice(0, limit).map((t, i) => ({
    rank: t.rank ?? i + 1,
    name: t.name,
    ...(t.artist_name ? { artist: t.artist_name } : {}),
    plays: t.play_count,
    hours: hoursFromMs(t.total_ms_played),
  }));
}

function asParams(args: Record<string, unknown>): TimeFilterParams {
  const period = (
    typeof args.period === "string" && PERIODS.includes(args.period as Period)
      ? args.period
      : "all"
  ) as TimeFilter;
  const year =
    typeof args.year === "number" && Number.isFinite(args.year)
      ? Math.floor(args.year)
      : undefined;
  const month =
    typeof args.month === "number" && Number.isFinite(args.month)
      ? Math.floor(args.month)
      : undefined;
  const startDate =
    typeof args.start_date === "string" ? args.start_date : undefined;
  return { filter: period, year, month, startDate };
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(raw)));
}

export async function executeAgentTool(
  name: string,
  rawArgs: unknown,
): Promise<string> {
  const args =
    rawArgs && typeof rawArgs === "object"
      ? (rawArgs as Record<string, unknown>)
      : {};

  try {
    const result = await dispatchTool(name, args);
    return JSON.stringify(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = /supabaseUrl is required|Falta NEXT_PUBLIC_SUPABASE/i.test(
      raw,
    )
      ? "Falta NEXT_PUBLIC_SUPABASE_URL (y SUPABASE_SERVICE_ROLE_KEY) en .env.local. Sin eso no puedo leer el historial. Pide que las copie desde Vercel o el dashboard de Supabase y reinicie el server."
      : raw;
    console.warn("[agent tool]", name, raw);
    return JSON.stringify({ error: message });
  }
}

async function dispatchTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_listening_overview":
      return getListeningOverview(args);
    case "get_top_items":
      return getTopItems(args);
    case "search_library":
      return searchLibrary(args);
    case "inspect_artist":
      return inspectArtist(args);
    case "get_calendar_memories":
      return getCalendarMemories(args);
    case "get_on_this_day":
      return getOnThisDay(args);
    case "get_ratings_snapshot":
      return getRatingsSnapshot(args);
    case "get_now_playing":
      return getNowPlaying();
    case "get_listening_gap":
      return getListeningGap();
    case "get_kurt_status":
      return getKurtSnapshot();
    case "control_player":
      return controlPlayer(args);
    case "play_tracks":
      return playTracks(args);
    case "find_unheard_tracks":
      return findUnheardTracks(args);
    case "inspect_now_playing":
      return inspectNowPlayingDeep();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function getListeningOverview(args: Record<string, unknown>) {
  const params = asParams(args);
  const [bundle, hourly] = await Promise.all([
    getDashboardBundlePayload(params, 8),
    getHourlyDistribution(params),
  ]);

  const topHours = [...hourly]
    .sort((a, b) => b.ms_played - a.ms_played)
    .slice(0, 4)
    .map((h) => ({
      hour: h.hour,
      label: `${String(h.hour).padStart(2, "0")}:00`,
      plays: h.play_count,
      hours: hoursFromMs(h.ms_played),
    }));

  return {
    period: params,
    timezone: DISPLAY_TIME_ZONE,
    hours: hoursFromMs(bundle.totalMs),
    plays: bundle.playCount,
    sessions: bundle.sessionCount,
    top_hours: topHours,
    years: bundle.yearsBreakdown.map((y) => ({
      year: y.year,
      hours: hoursFromMs(y.ms_played),
      plays: y.play_count,
    })),
    sample_top_artists: compactTop(bundle.topArtists, 5),
    sample_top_tracks: compactTop(bundle.topTracks, 5),
  };
}

async function getTopItems(args: Record<string, unknown>) {
  const params = asParams(args);
  const kind = String(args.kind ?? "tracks");
  const limit = clampLimit(args.limit, 12, 20);

  const items =
    kind === "artists"
      ? await getTopArtists(params, limit)
      : kind === "albums"
        ? await getTopAlbums(params, limit)
        : await getTopTracks(params, limit);

  return { kind, period: params, items: compactTop(items, limit) };
}

async function searchLibrary(args: Record<string, unknown>) {
  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query vacío" };
  const params = asParams(args);
  const kind = String(args.kind ?? "all");
  const want = (k: string) => kind === "all" || kind === k;

  const [tracks, artists, albums] = await Promise.all([
    want("tracks")
      ? fetchTracksLeaderboard(params, { search: query, offset: 0, limit: 8 })
      : Promise.resolve([]),
    want("artists")
      ? fetchArtistsLeaderboard(params, { search: query, offset: 0, limit: 8 })
      : Promise.resolve([]),
    want("albums")
      ? fetchAlbumsLeaderboard(params, { search: query, offset: 0, limit: 8 })
      : Promise.resolve([]),
  ]);

  return {
    query,
    period: params,
    tracks: compactTop(tracks, 8),
    artists: compactTop(artists, 8),
    albums: compactTop(albums, 8),
  };
}

async function inspectArtist(args: Record<string, unknown>) {
  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query vacío" };
  const params = asParams(args);
  const matches = await fetchArtistsLeaderboard(
    { filter: "all" },
    {
      search: query,
      offset: 0,
      limit: 5,
    },
  );
  const best = matches[0];
  if (!best) {
    return { query, found: false, note: "No aparece en el historial con ese nombre." };
  }

  const [profile, stats, tracks] = await Promise.all([
    fetchArtistProfile(best.id),
    fetchArtistPeriodStats(params, best.id),
    fetchArtistTracksInPeriod(params, best.id, 15),
  ]);

  return {
    query,
    found: true,
    artist: {
      id: best.id,
      name: profile?.name ?? best.name,
      genres: profile?.genres ?? [],
    },
    period: params,
    hours: hoursFromMs(stats.total_ms_played),
    plays: stats.play_count,
    top_tracks: compactTop(tracks, 15),
    other_matches: compactTop(matches.slice(1), 4),
  };
}

async function getCalendarMemories(args: Record<string, unknown>) {
  const year = Math.floor(Number(args.year));
  const month = Math.floor(Number(args.month));
  const dayRaw = Number(args.day ?? 0);
  const day = Number.isFinite(dayRaw) ? Math.max(0, Math.floor(dayRaw)) : 0;
  const limit = clampLimit(args.limit, 10, 20);

  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return { error: "year y month (1-12) requeridos" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_calendar_memories", {
    target_year: year,
    target_month: month,
    target_day: day,
    result_limit: limit,
  });
  if (error) throw error;

  const bundle = (data ?? {}) as Record<string, unknown>;
  const summary = (bundle.summary ?? {}) as Record<string, unknown>;
  const tracks = Array.isArray(bundle.tracks) ? bundle.tracks : [];
  const artists = Array.isArray(bundle.artists) ? bundle.artists : [];
  const albums = Array.isArray(bundle.albums) ? bundle.albums : [];

  const mapItem = (row: Record<string, unknown>) => ({
    name: String(row.name ?? ""),
    artist: row.artist_name ? String(row.artist_name) : undefined,
    plays: Number(row.play_count ?? 0),
    hours: hoursFromMs(Number(row.total_ms_played ?? 0)),
  });

  return {
    year,
    month,
    day: day || null,
    hours: hoursFromMs(Number(summary.total_ms ?? 0)),
    plays: Number(summary.play_count ?? 0),
    unique_tracks: Number(summary.unique_tracks ?? 0),
    unique_artists: Number(summary.unique_artists ?? 0),
    tracks: (tracks as Record<string, unknown>[]).slice(0, limit).map(mapItem),
    artists: (artists as Record<string, unknown>[]).slice(0, 8).map(mapItem),
    albums: (albums as Record<string, unknown>[]).slice(0, 6).map(mapItem),
  };
}

async function getOnThisDay(args: Record<string, unknown>) {
  const now = new Date();
  const month =
    typeof args.month === "number" && Number.isFinite(args.month)
      ? Math.min(12, Math.max(1, Math.floor(args.month)))
      : Number(formatInTimeZone(now, DISPLAY_TIME_ZONE, "M"));
  const day =
    typeof args.day === "number" && Number.isFinite(args.day)
      ? Math.min(31, Math.max(1, Math.floor(args.day)))
      : Number(formatInTimeZone(now, DISPLAY_TIME_ZONE, "d"));

  const supabase = createServerSupabaseClient();
  const { data: yearsData, error: yearsErr } = await supabase.rpc(
    "get_calendar_available_years",
  );
  if (yearsErr) throw yearsErr;

  const years = (Array.isArray(yearsData) ? yearsData : [])
    .map((r: { year?: unknown }) => Number(r.year))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a)
    .slice(0, 12);

  const perYear = (
    await Promise.all(
      years.map(async (year) => {
        const slice = await getCalendarMemories({
          year,
          month,
          day,
          limit: 4,
        });
        if ("error" in slice || !slice.plays) return null;
        return {
          year,
          hours: slice.hours,
          plays: slice.plays,
          top_tracks: slice.tracks.slice(0, 3),
          top_artists: slice.artists.slice(0, 3),
        };
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row != null);

  return {
    month,
    day,
    years_with_listens: perYear.length,
    memories: perYear,
  };
}

async function getRatingsSnapshot(args: Record<string, unknown>) {
  const search =
    typeof args.search === "string" ? args.search.trim() : "";

  if (search) {
    const { tracks, total } = await getRatedTracks({
      search,
      offset: 0,
      limit: 12,
      sortBy: "rating_desc",
    });
    return {
      search,
      total_matches: total,
      tracks: tracks.map((t) => ({
        name: t.track_name,
        artist: t.artist_name,
        album: t.album_name,
        rating: t.rating,
      })),
      note:
        total === 0
          ? "No hay valoraciones que coincidan con esa búsqueda. Eso NO es un error de conexión: Guille no valoró nada con ese nombre. Llama de nuevo sin search para el panorama."
          : undefined,
    };
  }

  const dash = await getRatingsDashboard();
  return {
    total_rated: dash.totalRated,
    avg_rating: dash.avgRating,
    distribution: dash.distribution,
    top_tracks: dash.topTracks.slice(0, 12).map((t) => ({
      name: t.track_name,
      artist: t.artist_name,
      rating: t.rating,
    })),
    top_albums: dash.topAlbums.slice(0, 8).map((a) => ({
      name: a.album_name,
      artist: a.artist_name,
      avg_rating: a.avg_rating,
      rated_tracks: a.rated_tracks,
    })),
    top_artists: dash.topArtists.slice(0, 8).map((a) => ({
      name: a.artist_name,
      avg_rating: a.avg_rating,
      rated_tracks: a.rated_tracks,
    })),
    recent: dash.recentRatings.slice(0, 8).map((t) => ({
      name: t.track_name,
      artist: t.artist_name,
      rating: t.rating,
    })),
    note:
      dash.totalRated === 0
        ? "Todavía no hay canciones valoradas en la base. No es un fallo de conexión."
        : "Estas SÍ son las valoraciones de Guille. No digas que no tienes acceso a ratings.",
  };
}

async function getNowPlaying() {
  const supabase = createServerSupabaseClient();
  let token = await getSpotifyAccessToken(supabase);

  const readLive = async (access: string) => {
    const data = await getCurrentlyPlaying(access);
    if (!data?.item) {
      return { is_playing: false, note: "Nada sonando ahora en Spotify." };
    }
    const track = data.item as {
      name?: string;
      duration_ms?: number;
      artists?: { name?: string }[];
      album?: { name?: string };
    };
    return {
      is_playing: Boolean(data.is_playing),
      track: track.name ?? null,
      artist: (track.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
      album: track.album?.name ?? null,
      progress_min: Math.round((Number(data.progress_ms ?? 0) / 60000) * 10) / 10,
      duration_min: Math.round((Number(track.duration_ms ?? 0) / 60000) * 10) / 10,
    };
  };

  if (token) {
    try {
      return await readLive(token);
    } catch (err) {
      if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
        const fresh = await forceRefreshSpotifyAccessToken(supabase);
        if (fresh) {
          try {
            return await readLive(fresh);
          } catch {
            /* fall through to table */
          }
        }
      }
    }
  }

  const { data } = await supabase
    .from("now_playing")
    .select("is_playing, progress_ms, updated_at, track_id, artist_id")
    .eq("id", 1)
    .maybeSingle();

  if (!data) {
    return {
      is_playing: false,
      note: "No hay sesión de Spotify conectada o no hay now playing.",
    };
  }

  return {
    is_playing: Boolean(data.is_playing),
    stale: true,
    updated_at: data.updated_at,
    note: "Spotify live no respondió; esto es el último snapshot guardado.",
  };
}

async function getListeningGap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("plays")
    .select(
      `
      played_at,
      ms_played,
      tracks (
        name,
        artists (name)
      )
    `,
    )
    .order("played_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) {
    return { silent: true, note: "No hay plays en la base." };
  }

  const lastAt = String((rows[0] as { played_at: string }).played_at);
  const lastMs = new Date(lastAt).getTime();
  const hoursAgo =
    Math.round(((Date.now() - lastMs) / 3_600_000) * 10) / 10;
  const daysAgo = Math.round((hoursAgo / 24) * 10) / 10;

  const mapPlay = (play: Record<string, unknown>) => {
    const t = play.tracks as null | {
      name?: string;
      artists?: { name?: string } | { name?: string }[] | null;
    };
    const artists = t?.artists;
    const artistName = Array.isArray(artists)
      ? artists.map((a) => a.name).filter(Boolean).join(", ")
      : artists?.name ?? null;
    return {
      when_chile: formatInTimeZone(
        new Date(String(play.played_at)),
        DISPLAY_TIME_ZONE,
        "yyyy-MM-dd HH:mm",
      ),
      track: t?.name ?? "(sin track)",
      artist: artistName,
      minutes: Math.round(Number(play.ms_played ?? 0) / 60000),
    };
  };

  const kurt = await getKurtStatus().catch(() => null);
  const listenedRecently =
    Boolean(kurt?.listened_today) ||
    (typeof hoursAgo === "number" && Number.isFinite(hoursAgo) && hoursAgo < 24);

  return {
    last_played_at: lastAt,
    last_played_chile: formatInTimeZone(
      new Date(lastAt),
      DISPLAY_TIME_ZONE,
      "EEEE d MMMM yyyy HH:mm",
    ),
    hours_ago: hoursAgo,
    days_ago: daysAgo,
    listened_today: kurt?.listened_today ?? listenedRecently,
    last_listen_day: kurt?.last_listen_day ?? null,
    current_streak: kurt?.current_streak ?? null,
    angry_mode: !listenedRecently && hoursAgo >= 24,
    extra_angry: !listenedRecently && hoursAgo >= 72,
    note: "Si listened_today es true o hours_ago < 24, NO digas que abandonó ni cites años viejos (2015–2020). Eso era un recorte de la racha.",
    recent: rows.map((r) => mapPlay(r as Record<string, unknown>)),
  };
}

async function getKurtSnapshot() {
  const status = await getKurtStatus();
  const mood = kurtMood(status);
  return {
    ...status,
    headline: mood.headline,
    subtitle: mood.subtitle,
    tone: mood.tone,
    days_without_shots: status.current_streak,
    note: "Un día cuenta con ≥1 play de 30s (Chile). Si no escuchó hoy, la racha sigue si ayer sí. Si kurt_down, racha 0.",
  };
}

function playerError(err: unknown) {
  if (err instanceof SpotifyPlayerError) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
      reconnect:
        err.code === "FORBIDDEN" || err.code === "EXPIRED"
          ? "/api/spotify/auth"
          : undefined,
    };
  }
  throw err;
}

async function controlPlayer(args: Record<string, unknown>) {
  const action = String(args.action ?? "");
  if (
    action !== "play" &&
    action !== "pause" &&
    action !== "next" &&
    action !== "previous"
  ) {
    return {
      error:
        "action inválida. Para play/pause/next/previous usa control_player. Para poner canciones concretas usa play_tracks.",
    };
  }
  try {
    await controlPlayback(action);
    const snapshot = await getPlayerSnapshot().catch(() => null);
    return {
      ok: true,
      action,
      is_playing: snapshot?.is_playing ?? action === "play",
      device: snapshot?.device ?? null,
      track: snapshot?.track
        ? {
            name: snapshot.track.name,
            artist: snapshot.track.artist,
            album: snapshot.track.album,
          }
        : null,
      up_next: (snapshot?.queue ?? []).slice(0, 5).map((t) => ({
        name: t.name,
        artist: t.artist,
      })),
    };
  } catch (err) {
    return playerError(err);
  }
}

function normalizeTrackTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(
      /\b(feat\.?|ft\.?|with|remaster(ed)?|live|radio edit|version|deluxe|bonus track|single version)\b.*$/i,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadHeardTracksForArtist(artistId: string): Promise<
  { id: string; name: string; spotify_id: string | null }[]
> {
  const supabase = createServerSupabaseClient();
  const rows: { id: string; name: string; spotify_id: string | null }[] = [];

  const pull = async (withSpotifyId: boolean) => {
    for (let offset = 0; offset < 4000; offset += 1000) {
      const query = withSpotifyId
        ? supabase
            .from("tracks")
            .select("id, name, spotify_id")
            .eq("artist_id", artistId)
            .range(offset, offset + 999)
        : supabase
            .from("tracks")
            .select("id, name")
            .eq("artist_id", artistId)
            .range(offset, offset + 999);
      const { data, error } = await query;
      if (error) {
        if (withSpotifyId && /spotify_id/i.test(error.message)) {
          return pull(false);
        }
        throw error;
      }
      const batch = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of batch) {
        rows.push({
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          spotify_id:
            typeof row.spotify_id === "string" && row.spotify_id
              ? row.spotify_id
              : null,
        });
      }
      if (batch.length < 1000) break;
    }
  };

  await pull(true);
  return rows.filter((r) => r.id && r.name);
}

async function playArtistName(nameOrUri: string, mode: "replace" | "queue") {
  const uriFromInput = toArtistUri(nameOrUri);
  const artist = uriFromInput
    ? {
        id: uriFromInput.slice("spotify:artist:".length),
        name: nameOrUri,
        uri: uriFromInput,
      }
    : await searchSpotifyArtist(nameOrUri);
  if (!artist) {
    return { ok: false, error: `No encontré al artista «${nameOrUri}» en Spotify.` };
  }

  let used: "context" | "top_tracks" = "context";
  let note: string | null = null;
  let playMode = mode;

  if (playMode === "queue") {
    const snapshot = await getPlayerSnapshot().catch(() => null);
    if (!snapshot?.track && !snapshot?.is_playing) {
      playMode = "replace";
      note = "No había nada sonando: empecé al artista desde cero.";
    }
  }

  const topUris = await getArtistTopTrackUris(artist.id);

  if (playMode === "queue") {
    if (!topUris.length) {
      return { ok: false, error: `No pude armar la cola de ${artist.name}.` };
    }
    await addUrisToQueue(topUris);
    used = "top_tracks";
  } else {
    try {
      await startPlayingContext(artist.uri);
    } catch (err) {
      if (
        err instanceof SpotifyPlayerError &&
        (err.code === "RESTRICTED" || err.code === "SPOTIFY") &&
        topUris.length
      ) {
        await startPlayingUris(topUris);
        used = "top_tracks";
        note = [
          note,
          "Spotify no dejó poner el artista entero en este dispositivo; puse sus temas más escuchados.",
        ]
          .filter(Boolean)
          .join(" ");
      } else {
        throw err;
      }
    }
  }

  const after = await getPlayerSnapshot().catch(() => null);
  return {
    ok: true,
    mode: playMode,
    kind: "artist",
    artist: artist.name,
    via: used,
    note,
    now: after?.track
      ? { name: after.track.name, artist: after.track.artist }
      : null,
    is_playing: after?.is_playing ?? playMode === "replace",
    device: after?.device ?? null,
  };
}

async function playTracks(args: Record<string, unknown>) {
  const modeRaw = String(args.mode ?? "replace");
  let mode: "replace" | "queue" = modeRaw === "queue" ? "queue" : "replace";
  const artistArg = String(args.artist ?? "").trim();
  const queries = Array.isArray(args.queries)
    ? args.queries.map((q) => String(q ?? "").trim()).filter(Boolean)
    : [];

  try {
    if (artistArg) return await playArtistName(artistArg, mode);

    if (queries.length === 1 && toArtistUri(queries[0])) {
      return await playArtistName(queries[0], mode);
    }

    const albumUri = queries.length === 1 ? toAlbumUri(queries[0]) : null;
    if (albumUri && mode === "replace") {
      await startPlayingContext(albumUri);
      const after = await getPlayerSnapshot().catch(() => null);
      return {
        ok: true,
        mode,
        kind: "album",
        now: after?.track
          ? { name: after.track.name, artist: after.track.artist }
          : null,
        is_playing: after?.is_playing ?? true,
        device: after?.device ?? null,
      };
    }

    if (!queries.length) {
      return {
        error:
          "Pasá artist (para un artista) o queries (temas / álbum).",
      };
    }

    const { resolved, missing } = await resolveTrackQueries(queries);
    const unique: typeof resolved = [];
    const seen = new Set<string>();
    for (const t of resolved) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }
    if (!unique.length) {
      if (queries.length === 1) {
        return await playArtistName(queries[0], mode);
      }
      return {
        ok: false,
        error: "No pude resolver esas canciones en Spotify.",
        missing,
      };
    }

    let note: string | null = null;
    if (mode === "queue") {
      const snapshot = await getPlayerSnapshot().catch(() => null);
      if (!snapshot?.track && !snapshot?.is_playing) {
        mode = "replace";
        note = "No había nada sonando: empecé la lista desde cero.";
      }
    }

    const uris = unique.map((t) => t.uri);
    if (mode === "queue") await addUrisToQueue(uris);
    else await startPlayingUris(uris);

    const after = await getPlayerSnapshot().catch(() => null);
    return {
      ok: true,
      mode,
      note,
      played_or_queued: unique.map((t) => ({
        name: t.name,
        artist: t.artist,
        album: t.album,
        uri: t.uri,
      })),
      missing: missing.length ? missing : undefined,
      now: after?.track
        ? { name: after.track.name, artist: after.track.artist }
        : null,
      is_playing: after?.is_playing ?? mode === "replace",
      device: after?.device ?? null,
    };
  } catch (err) {
    return playerError(err);
  }
}

async function findUnheardTracks(args: Record<string, unknown>) {
  const artist = String(args.artist ?? "").trim();
  if (!artist) return { error: "artist vacío" };
  const limit = clampLimit(args.limit, 12, 20);

  const [catalog, matches] = await Promise.all([
    fetchArtistDiscographyTracks(artist),
    fetchArtistsLeaderboard(
      { filter: "all" },
      { search: artist, offset: 0, limit: 5 },
    ),
  ]);

  if (!catalog) {
    return {
      found: false,
      artist,
      note: "No encontré ese artista en el catálogo de Spotify.",
    };
  }

  const catalogName = catalog.artist.name.toLowerCase();
  const relevantArtists = matches.filter(
    (m) => m.name.toLowerCase() === catalogName,
  );
  if (!relevantArtists.length && matches[0]) relevantArtists.push(matches[0]);

  const heardNames = new Set<string>();
  const heardIds = new Set<string>();
  let heardCount = 0;
  for (const libraryArtist of relevantArtists) {
    const heard = await loadHeardTracksForArtist(libraryArtist.id);
    heardCount += heard.length;
    for (const t of heard) {
      const norm = normalizeTrackTitle(t.name);
      if (norm) heardNames.add(norm);
      heardIds.add(t.id);
      if (t.spotify_id) heardIds.add(t.spotify_id);
    }
  }

  const catalogUnique = new Map<string, (typeof catalog.tracks)[number]>();
  for (const t of catalog.tracks) {
    const key = normalizeTrackTitle(t.name) || t.id;
    const prev = catalogUnique.get(key);
    if (!prev || (t.popularity ?? 0) > (prev.popularity ?? 0)) {
      catalogUnique.set(key, t);
    }
  }

  const unheard = Array.from(catalogUnique.values()).filter((t) => {
    if (heardIds.has(t.id)) return false;
    const norm = normalizeTrackTitle(t.name);
    if (norm && heardNames.has(norm)) return false;
    return true;
  });
  const ranked = (
    await hydrateCatalogPopularity(unheard.slice(0, 80))
  ).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  return {
    found: true,
    artist: catalog.artist.name,
    heard_in_your_library: heardCount,
    catalog_unique_tracks: catalogUnique.size,
    unheard_count: unheard.length,
    unheard: ranked.slice(0, limit).map((t) => ({
      name: t.name,
      album: t.album,
      year: t.release_year,
      popularity: t.popularity,
      uri: t.uri,
    })),
    note:
      unheard.length === 0
        ? "Parece que ya pasó por todo el catálogo oficial (álbumes + singles). No inventes temas."
        : "Estos NO están en el historial de Guille (ni por id ni por título). Listalos concreto. Si pide que los ponga, usa play_tracks con estos uri o 'artista - tema'.",
  };
}

async function inspectNowPlayingDeep() {
  let snapshot;
  try {
    snapshot = await getPlayerSnapshot();
  } catch (err) {
    return playerError(err);
  }

  if (!snapshot.track) {
    return { is_playing: false, note: "Nada sonando ahora en Spotify." };
  }

  const track = snapshot.track;
  const artistQuery = track.artist.split(",")[0]?.trim() || track.artist;

  const asError = (err: unknown) => ({
    error: err instanceof Error ? err.message : String(err),
  });

  const [library, artist, ratingLookup, catalog] = await Promise.all([
    searchLibrary({ query: track.name, kind: "tracks", period: "all" }).catch(
      asError,
    ),
    inspectArtist({ query: artistQuery, period: "all" }).catch(asError),
    lookupRatingForPlayingTrack({
      spotifyTrackId: track.id,
      trackName: track.name,
      artistName: track.artist,
    }).catch((err) => ({
      rating: null as number | null,
      track_name: null as string | null,
      artist_name: null as string | null,
      album_name: null as string | null,
      error: err instanceof Error ? err.message : String(err),
    })),
    track.id
      ? getCatalogTrackFacts(track.id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const playingRating =
    "rating" in ratingLookup ? ratingLookup.rating : null;
  const ratingsError =
    "error" in ratingLookup && ratingLookup.error
      ? String(ratingLookup.error)
      : null;

  return {
    is_playing: snapshot.is_playing,
    device: snapshot.device,
    progress_min: Math.round((snapshot.progress_ms / 60_000) * 10) / 10,
    duration_min: Math.round((track.duration_ms / 60_000) * 10) / 10,
    track: {
      name: track.name,
      artist: track.artist,
      album: track.album,
    },
    spotify_catalog: catalog,
    in_your_library: library,
    artist_in_history: artist,
    playing_track_rating: playingRating,
    playing_track_rated: playingRating != null,
    your_rating:
      playingRating != null && "track_name" in ratingLookup
        ? {
            name: ratingLookup.track_name ?? track.name,
            artist: ratingLookup.artist_name ?? track.artist,
            album: ratingLookup.album_name,
            rating: playingRating,
          }
        : null,
    ratings_error: ratingsError,
    note:
      ratingsError
        ? `Falló la consulta de ratings (${ratingsError}). Si hay plays en in_your_library, las stats SÍ están conectadas; no digas que no tienes acceso a las stats.`
        : playingRating == null
          ? "Guille no valoró esta canción (1–10). Eso NO es un error de conexión ni falta de acceso. Si pide el panorama de ratings, usa get_ratings_snapshot. spotify_catalog.context_es ya resume lanzamiento/álbum. Popularidad 0–100 (no streams). Un dato freak REAL o nada."
          : "playing_track_rating es el 1–10 de Guille para este tema. Las stats están conectadas. spotify_catalog.context_es ya resume lanzamiento/álbum. Popularidad 0–100 (no streams). Un dato freak REAL o nada.",
  };
}
