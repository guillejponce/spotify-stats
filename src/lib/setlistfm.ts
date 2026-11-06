import type { UserCtx } from "@/lib/user-context";

const SETLIST_API = "https://api.setlist.fm/rest/1.0";
const MAX_PAGES = 25;

export type RawArtist = { mbid?: string; name?: string; url?: string };

export type RawSong = {
  name?: string;
  tape?: boolean;
  info?: string;
  cover?: RawArtist;
  with?: RawArtist;
};

export type RawSet = {
  name?: string;
  encore?: number;
  song?: RawSong | RawSong[];
};

export type RawSetlist = {
  id?: string;
  eventDate?: string;
  url?: string;
  artist?: RawArtist;
  venue?: {
    id?: string;
    name?: string;
    url?: string;
    city?: {
      id?: string;
      name?: string;
      country?: { name?: string; code?: string };
    };
  };
  tour?: { name?: string };
  info?: string;
  set?: RawSet | RawSet[];
};

export type AttendedPage =
  | { kind: "ok"; setlists: RawSetlist[]; total: number; partial: boolean }
  | { kind: "private" }
  | { kind: "empty" }
  | { kind: "missing-key" }
  | { kind: "unavailable" };

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

async function fetchAttendedPage(
  username: string,
  page: number,
  apiKey: string,
): Promise<{ status: number; setlists: RawSetlist[]; total: number; itemsPerPage: number }> {
  const url = new URL(`${SETLIST_API}/user/${encodeURIComponent(username)}/attended`);
  url.searchParams.set("p", String(page));
  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return { status: response.status, setlists: [], total: 0, itemsPerPage: 20 };
  }
  const json = (await response.json()) as {
    setlist?: RawSetlist | RawSetlist[];
    total?: number;
    itemsPerPage?: number;
  };
  return {
    status: response.status,
    setlists: asList(json.setlist),
    total: Number(json.total) || 0,
    itemsPerPage: Number(json.itemsPerPage) || 20,
  };
}

export async function loadAttendedSetlists(username: string): Promise<AttendedPage> {
  const apiKey = process.env.SETLISTFM_API_KEY?.trim();
  if (!apiKey) return { kind: "missing-key" };

  const first = await fetchAttendedPage(username, 1, apiKey);
  if (first.status === 403) return { kind: "private" };
  if (first.status === 404) return { kind: "empty" };
  if (first.status !== 200) return { kind: "unavailable" };
  if (!first.setlists.length) return { kind: "empty" };

  const pages = Math.min(
    MAX_PAGES,
    Math.max(1, Math.ceil(first.total / Math.max(first.itemsPerPage, 1))),
  );
  const rows = [...first.setlists];
  let partial = pages * first.itemsPerPage < first.total;

  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchAttendedPage(username, page, apiKey);
    if (next.status === 429 || next.status !== 200) {
      partial = true;
      break;
    }
    rows.push(...next.setlists);
  }

  const seen = new Set<string>();
  const setlists = rows.filter((row) => {
    const id = row.id ?? "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (!setlists.length) return { kind: "empty" };
  return { kind: "ok", setlists, total: first.total || setlists.length, partial };
}

export async function loadSetlist(id: string): Promise<RawSetlist | null | "missing-key" | "unavailable"> {
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;
  const apiKey = process.env.SETLISTFM_API_KEY?.trim();
  if (!apiKey) return "missing-key";

  const response = await fetch(`${SETLIST_API}/setlist/${id}`, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    next: { revalidate: 60 * 60 },
  });
  if (response.status === 404) return null;
  if (!response.ok) return "unavailable";
  return (await response.json()) as RawSetlist;
}
