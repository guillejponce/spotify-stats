import { formatInTimeZone } from "date-fns-tz";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  DISPLAY_TIME_ZONE,
  formatChileCalendarDayLong,
  CHILE_WEEKDAY_ROWS,
} from "@/lib/chile-time";
import { getDashboardBundlePayload, getHeatmapData } from "@/lib/stats";
import { fetchTracksLeaderboard } from "@/lib/track-browse";
import { fetchArtistsLeaderboard } from "@/lib/artist-browse";
import { fetchAlbumsLeaderboard } from "@/lib/album-browse";
import { formatMs, formatReproductionCount } from "@/lib/utils";
import type { TimeFilterParams, TopItem } from "@/types/database";
import type {
  WrappedFact,
  WrappedPayload,
  WrappedRace,
  WrappedRacer,
} from "@/types/wrapped";

const TRACK_BOARD_LIMIT = 100;
const ARTIST_BOARD_LIMIT = 100;
const ALBUM_RACE_LIMIT = 8;

function addYmd(date: string, days: number): string {
  const [y, m, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysInGregorianYear(year: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return leap ? 366 : 365;
}

function dayOfYear(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.floor((cur - start) / 86_400_000) + 1;
}

function tightnessOf(items: WrappedRacer[]): WrappedRace["tightness"] {
  if (items.length === 0) return "empty";
  if (items.length === 1 || items[0]!.play_count <= 0) return "runaway";
  const lead = items[0]!.play_count;
  const second = items[1]?.play_count ?? 0;
  const ratio = lead > 0 ? second / lead : 0;
  if (ratio >= 0.82) return "open";
  if (ratio >= 0.48) return "fight";
  return "runaway";
}

function tightnessLabel(
  kind: WrappedRace["tightness"],
  locked: boolean,
): string {
  if (locked) {
    switch (kind) {
      case "open":
        return "Cerró apretado";
      case "fight":
        return "Hubo pelea";
      case "runaway":
        return "Ganó claro";
      default:
        return "Sin premio";
    }
  }
  switch (kind) {
    case "open":
      return "Carrera abierta";
    case "fight":
      return "Hay pelea";
    case "runaway":
      return "Se está escapando";
    default:
      return "Todavía no hay carrera";
  }
}

function toRacer(
  row: TopItem & { artist_name?: string },
  index: number,
  href: string | null,
): WrappedRacer {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.artist_name ?? null,
    image_url: row.image_url,
    play_count: row.play_count,
    ms_played: row.total_ms_played,
    rank: row.rank ?? index + 1,
    href,
  };
}

function buildRace(
  title: string,
  trophy: string,
  items: WrappedRacer[],
  locked: boolean,
): WrappedRace {
  const tightness = tightnessOf(items);
  return {
    title,
    trophy,
    tightness,
    tightness_label: tightnessLabel(tightness, locked),
    locked,
    items,
  };
}

async function listListenYears(
  currentYear: number,
  requestedYear: number,
): Promise<number[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_calendar_available_years");
  const fromDb =
    error || !Array.isArray(data)
      ? []
      : data
          .map((r: { year?: unknown }) => Number(r.year))
          .filter((y) => Number.isFinite(y) && y >= 2010 && y <= 2100);
  const years = new Set(fromDb);
  years.add(currentYear);
  years.add(requestedYear);
  return Array.from(years).sort((a, b) => b - a);
}

function longestStreak(dates: string[]): number {
  const sorted = Array.from(new Set(dates)).sort();
  if (sorted.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === addYmd(sorted[i - 1]!, 1)) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

function weekdayFromYmd(ymd: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export async function getWrappedPayload(
  year: number,
  now = new Date(),
): Promise<WrappedPayload> {
  const today = formatInTimeZone(now, DISPLAY_TIME_ZONE, "yyyy-MM-dd");
  const todayYear = Number(today.slice(0, 4));
  const isCurrent = todayYear === year;
  const totalDays = daysInGregorianYear(year);
  let elapsed = totalDays;
  if (isCurrent) elapsed = dayOfYear(today);
  else if (todayYear < year) elapsed = 0;

  const params: TimeFilterParams = { filter: "year", year };
  const yearQs = `filter=year&year=${year}`;

  const [bundle, heatmap, tracks, artists, albums, lastBundle, availableYears] =
    await Promise.all([
      getDashboardBundlePayload(params, 8),
      getHeatmapData(year).catch(() => []),
      fetchTracksLeaderboard(params, {
        search: "",
        offset: 0,
        limit: TRACK_BOARD_LIMIT,
        withDelta: false,
      }),
      fetchArtistsLeaderboard(params, {
        search: "",
        offset: 0,
        limit: ARTIST_BOARD_LIMIT,
        withDelta: false,
      }),
      fetchAlbumsLeaderboard(params, {
        search: "",
        offset: 0,
        limit: ALBUM_RACE_LIMIT,
        withDelta: false,
      }),
      year > 2014
        ? getDashboardBundlePayload({ filter: "year", year: year - 1 }, 1).catch(
            () => null,
          )
        : Promise.resolve(null),
      listListenYears(todayYear, year).catch(() => [todayYear, year]),
    ]);

  const listenDaysSet = new Set(
    heatmap.filter((d) => d.count > 0 || d.ms_played >= 30_000).map((d) => d.date),
  );
  const listenDays = listenDaysSet.size;
  const projectedMs =
    elapsed > 0 ? Math.round((bundle.totalMs / elapsed) * totalDays) : 0;

  const mmdd = today.slice(5);
  let vsLastYear: WrappedPayload["vs_last_year"] = null;
  if (lastBundle && lastBundle.playCount > 0) {
    const ytdDays = lastBundle.listeningOverTime.filter((d) => {
      if (d.date.slice(0, 4) !== String(year - 1)) return false;
      return isCurrent ? d.date.slice(5) <= mmdd : true;
    });
    const ytdMs = ytdDays.reduce((s, d) => s + d.ms_played, 0);
    const ytdPlays = ytdDays.reduce((s, d) => s + d.play_count, 0);
    const ytdListen = ytdDays.filter((d) => d.play_count > 0 || d.ms_played > 0)
      .length;
    const msDelta =
      ytdMs > 0 ? Math.round(((bundle.totalMs - ytdMs) / ytdMs) * 1000) / 10 : null;
    vsLastYear = {
      last_year: year - 1,
      ms_played: ytdMs,
      play_count: ytdPlays,
      listen_days: ytdListen,
      ms_delta_pct: msDelta,
    };
  }

  const trackRacers = tracks.map((row, i) =>
    toRacer(row, i, `/tracks?${yearQs}`),
  );
  const artistRacers = artists.map((row, i) =>
    toRacer(row, i, `/artists/${row.id}?${yearQs}`),
  );
  const albumRacers = albums.map((row, i) =>
    toRacer(row, i, `/albums/${row.id}?${yearQs}`),
  );

  const topDays = [...bundle.listeningOverTime]
    .filter((d) => d.ms_played > 0)
    .sort((a, b) => b.ms_played - a.ms_played || b.play_count - a.play_count)
    .slice(0, 8)
    .map((d) => ({
      date: d.date,
      label: formatChileCalendarDayLong(d.date),
      play_count: d.play_count,
      ms_played: d.ms_played,
    }));

  const weekdayMs = Array.from({ length: 7 }, () => 0);
  for (const d of bundle.listeningOverTime) {
    const w = weekdayFromYmd(d.date);
    if (w == null) continue;
    weekdayMs[w] += d.ms_played;
  }
  const peakWeekday = weekdayMs.reduce(
    (best, ms, i) => (ms > weekdayMs[best] ? i : best),
    0,
  );
  const peakHour = bundle.hourlyData.reduce(
    (best, row) => (row.ms_played > best.ms_played ? row : best),
    bundle.hourlyData[0] ?? { hour: 0, ms_played: 0, play_count: 0 },
  );
  const peakMonth = [...bundle.monthsTop].sort(
    (a, b) => b.ms_played - a.ms_played,
  )[0];
  const owlMs = bundle.hourlyData
    .filter((h) => h.hour <= 4)
    .reduce((s, h) => s + h.ms_played, 0);
  const morningMs = bundle.hourlyData
    .filter((h) => h.hour >= 6 && h.hour <= 11)
    .reduce((s, h) => s + h.ms_played, 0);
  const streak = longestStreak(Array.from(listenDaysSet));
  const topArtistShare =
    bundle.playCount > 0 && artistRacers[0]
      ? Math.round((artistRacers[0].play_count / bundle.playCount) * 1000) / 10
      : 0;
  const consistency =
    elapsed > 0 ? Math.round((listenDays / elapsed) * 1000) / 10 : 0;

  const MONTH_NAMES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  const facts: WrappedFact[] = [];
  if (topDays[0]) {
    facts.push({
      label: "Día más intenso",
      value: formatMs(topDays[0].ms_played),
      hint: topDays[0].label,
    });
  }
  if (peakMonth) {
    const idx = Number(peakMonth.period) - 1;
    facts.push({
      label: "Mes que manda",
      value: idx >= 0 && idx < 12 ? MONTH_NAMES[idx]! : peakMonth.period,
      hint: `${formatReproductionCount(peakMonth.play_count)} repros`,
    });
  }
  facts.push({
    label: "Día de la semana",
    value: CHILE_WEEKDAY_ROWS[peakWeekday] ?? "—",
    hint: "donde más horas acumulás",
  });
  if (peakHour.ms_played > 0) {
    facts.push({
      label: "Hora pico",
      value: `${String(peakHour.hour).padStart(2, "0")}:00`,
      hint: formatMs(peakHour.ms_played),
    });
  }
  facts.push({
    label: "Consistencia",
    value: `${consistency}%`,
    hint: `${listenDays} de ${elapsed} días con música`,
  });
  facts.push({
    label: "Racha más larga",
    value: `${streak} día${streak === 1 ? "" : "s"}`,
    hint: "seguidos este año",
  });
  if (artistRacers[0] && topArtistShare > 0) {
    facts.push({
      label: "Monocultivo",
      value: `${topArtistShare}%`,
      hint: `de las repros van a ${artistRacers[0].name}`,
    });
  }
  facts.push({
    label: owlMs >= morningMs ? "Búho" : "Madrugador",
    value: owlMs >= morningMs ? "De madrugada" : "De mañana",
    hint:
      owlMs >= morningMs
        ? "0–4 h gana a 6–11 h"
        : "6–11 h gana a la madrugada",
  });
  if (projectedMs > bundle.totalMs && isCurrent && elapsed > 7) {
    facts.push({
      label: "Si seguís así",
      value: formatMs(projectedMs),
      hint: `proyección a fin de ${year}`,
    });
  }

  return {
    year,
    generated_at: now.toISOString(),
    is_current_year: isCurrent,
    progress: {
      elapsed_days: elapsed,
      total_days: totalDays,
      remaining_days: Math.max(0, totalDays - elapsed),
      pct: Math.round((elapsed / totalDays) * 1000) / 10,
      today,
    },
    totals: {
      ms_played: bundle.totalMs,
      play_count: bundle.playCount,
      listen_days: listenDays,
      projected_ms: projectedMs,
    },
    vs_last_year: vsLastYear,
    available_years: availableYears,
    races: {
      track: buildRace("Canción del año", "Tema", trackRacers, !isCurrent),
      artist: buildRace("Artista del año", "Artista", artistRacers, !isCurrent),
      album: buildRace("Álbum del año", "Álbum", albumRacers, !isCurrent),
    },
    months: bundle.monthsTop,
    top_days: topDays,
    hourly: bundle.hourlyData,
    daily: bundle.listeningOverTime,
    heatmap,
    facts,
  };
}
