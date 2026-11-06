import type { UserCtx } from "@/lib/user-context";

const SETLIST_API = "https://api.setlist.fm/rest/1.0";

export interface ConcertShow {
  id: string;
  artistName: string;
  eventDate: string;
  venueName: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  tour: string | null;
  url: string;
  songs: string[];
}

export type AttendedResult =
  | { kind: "ok"; shows: ConcertShow[]; total: number }
  | { kind: "private" }
  | { kind: "empty" }
  | { kind: "missing-key" }
  | { kind: "unavailable" };

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

export function setlistFmConfigured(): boolean {
  return Boolean(process.env.SETLISTFM_API_KEY?.trim());
}

export function parseSetlistUsername(raw: string): string | null {
  let value = raw.trim().replace(/^@/, "");
  const fromUrl = value.match(/setlist\.fm\/user\/([^/?#]+)/i);
  if (fromUrl) {
    try {
      value = decodeURIComponent(fromUrl[1]);
    } catch {
      value = fromUrl[1];
    }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(value)) return null;
  return value;
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

function toShow(setlist: RawSetlist): ConcertShow | null {
  const eventDate = eventIso(setlist.eventDate ?? "");
  if (!setlist.id || !eventDate || !setlist.url) return null;
  return {
    id: setlist.id,
    artistName: setlist.artist?.name?.trim() || "Artista",
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

function columnMissing(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || (error.message ?? "").includes("setlist_fm_user");
}

export async function getLinkedSetlistUser(ctx: UserCtx): Promise<{
  username: string | null;
  columnReady: boolean;
}> {
  const { data, error } = await ctx.db
    .from("profiles")
    .select("setlist_fm_user")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) {
    if (columnMissing(error)) return { username: null, columnReady: false };
    throw new Error(error.message);
  }
  const username = typeof data?.setlist_fm_user === "string" ? data.setlist_fm_user.trim() : "";
  return { username: username || null, columnReady: true };
}

export async function saveSetlistUser(ctx: UserCtx, username: string | null): Promise<void> {
  const { error } = await ctx.db
    .from("profiles")
    .update({ setlist_fm_user: username })
    .eq("id", ctx.userId);
  if (error) {
    if (columnMissing(error)) {
      throw new Error("Falta correr supabase/setlistfm_user.sql en Supabase.");
    }
    throw new Error(error.message);
  }
}

export async function attendedShows(username: string): Promise<AttendedResult> {
  const apiKey = process.env.SETLISTFM_API_KEY?.trim();
  if (!apiKey) return { kind: "missing-key" };

  const url = new URL(`${SETLIST_API}/user/${encodeURIComponent(username)}/attended`);
  url.searchParams.set("p", "1");
  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 403) return { kind: "private" };
  if (response.status === 404) return { kind: "empty" };
  if (!response.ok) return { kind: "unavailable" };

  const json = (await response.json()) as {
    setlist?: RawSetlist | RawSetlist[];
    total?: number;
  };
  const shows = asList(json.setlist)
    .map((row) => toShow(row))
    .filter((row): row is ConcertShow => Boolean(row))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  if (!shows.length) return { kind: "empty" };
  return { kind: "ok", shows, total: Number(json.total) || shows.length };
}
