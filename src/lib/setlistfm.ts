import { getTopArtists } from "@/lib/stats";
import type { UserCtx } from "@/lib/user-context";

const SETLIST_API = "https://api.setlist.fm/rest/1.0";

export interface ConcertShow {
  id: string;
  artistName: string;
  artistImage: string | null;
  eventDate: string;
  venueName: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  tour: string | null;
  url: string;
  songs: string[];
}

type RawSong = { name?: string };
type RawSet = { song?: RawSong | RawSong[] };
type RawSetlist = {
  id?: string;
  eventDate?: string;
  url?: string;
  artist?: { name?: string };
  venue?: {
    name?: string;
    city?: { name?: string; country?: { name?: string; code?: string } };
  };
  tour?: { name?: string };
  set?: RawSet | RawSet[];
};

function asList<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function eventIso(value: string): string {
  const [day, month, year] = value.split("-");
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

function songsOf(setlist: RawSetlist): string[] {
  const names: string[] = [];
  for (const set of asList(setlist.set)) {
    for (const song of asList(set.song)) {
      const name = song.name?.trim();
      if (name) names.push(name);
    }
  }
  return names.slice(0, 12);
}

function toShow(setlist: RawSetlist, artistImage: string | null): ConcertShow | null {
  const eventDate = eventIso(setlist.eventDate ?? "");
  if (!setlist.id || !eventDate || !setlist.url) return null;
  return {
    id: setlist.id,
    artistName: setlist.artist?.name?.trim() || "Artista",
    artistImage,
    eventDate,
    venueName: setlist.venue?.name?.trim() || "Venue",
    cityName: setlist.venue?.city?.name?.trim() || "",
    countryName: setlist.venue?.city?.country?.name?.trim() || "",
    countryCode: setlist.venue?.city?.country?.code?.trim() || "",
    tour: setlist.tour?.name?.trim() || null,
    url: setlist.url,
    songs: songsOf(setlist),
  };
}

async function searchYear(artistName: string, year: number, apiKey: string): Promise<RawSetlist[]> {
  const url = new URL(`${SETLIST_API}/search/setlists`);
  url.searchParams.set("artistName", artistName);
  url.searchParams.set("year", String(year));
  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (response.status === 404) return [];
  if (response.status === 429) {
    const error = new Error("setlist.fm rate limit");
    error.name = "SetlistRateLimit";
    throw error;
  }
  if (!response.ok) throw new Error(`setlist.fm ${response.status}`);
  const json = (await response.json()) as { setlist?: RawSetlist | RawSetlist[] };
  return asList(json.setlist);
}

async function latestShow(
  artistName: string,
  artistImage: string | null,
  apiKey: string,
): Promise<ConcertShow | null> {
  const year = new Date().getFullYear();
  for (const candidate of [year, year - 1, year - 2]) {
    const rows = await searchYear(artistName, candidate, apiKey);
    const exact = rows.filter(
      (row) => row.artist?.name?.trim().toLowerCase() === artistName.trim().toLowerCase(),
    );
    const pool = exact.length ? exact : [];
    const newest = pool
      .map((row) => toShow(row, artistImage))
      .filter((row): row is ConcertShow => Boolean(row))
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate))[0];
    if (newest) return newest;
  }
  return null;
}

export function setlistFmConfigured(): boolean {
  return Boolean(process.env.SETLISTFM_API_KEY?.trim());
}

export async function recentShowsForUser(ctx: UserCtx): Promise<{
  shows: ConcertShow[];
  limited: boolean;
}> {
  const apiKey = process.env.SETLISTFM_API_KEY?.trim();
  if (!apiKey) return { shows: [], limited: false };

  const artists = await getTopArtists(ctx, { filter: "last_6_months" }, 6);
  const shows: ConcertShow[] = [];
  let limited = false;

  for (const artist of artists) {
    if (!artist.name.trim()) continue;
    try {
      const show = await latestShow(artist.name, artist.image_url, apiKey);
      if (show) shows.push(show);
    } catch (error) {
      if (error instanceof Error && error.name === "SetlistRateLimit") {
        limited = true;
        break;
      }
      console.warn("[setlist.fm]", artist.name, error);
    }
  }

  shows.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  return { shows, limited };
}
