// @ts-nocheck — Deno Edge Function: HTTP imports + Deno globals are valid at runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

/** Igual que en la app: `PLAYBACK_PLATFORM_SPOTIFY_SYNC` (Deno no importa `src/`). */
const PLAYBACK_PLATFORM_SPOTIFY_SYNC = "spotify_recent_api";

type SpotifyTokenRow = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

function parseReleaseDate(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const t = input.trim();
  if (/^\d{4}$/.test(t)) return `${t}-01-01`;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function playAtKey(trackId: string, playedAt: string): string {
  return `${trackId}|${new Date(playedAt).toISOString()}`;
}

async function readResponseBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const t = await readResponseBody(res);
    return t ? { _raw: t } : {};
  }
  const text = await readResponseBody(res);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _parseError: true, _raw: text };
  }
}

type SyncDb = ReturnType<typeof createClient>;

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || /duplicate key|unique constraint/i.test(err.message ?? "");
}

async function resolveArtistDbId(
  supabase: SyncDb,
  payload: {
    spotifyId: string;
    name: string;
    image_url: string | null;
    spotify_url: string | null;
  },
): Promise<string | null> {
  const extras = {
    ...(payload.spotify_url ? { spotify_url: payload.spotify_url } : {}),
  };

  const byName = await supabase
    .from("artists")
    .upsert({ name: payload.name, ...extras }, { onConflict: "name" })
    .select("id, image_url")
    .maybeSingle();

  if (!byName.error && byName.data?.id) {
    if (!byName.data.image_url && payload.image_url) {
      await supabase
        .from("artists")
        .update({ image_url: payload.image_url })
        .eq("id", byName.data.id)
        .is("image_url", null);
    }
    return byName.data.id as string;
  }

  const byId = await supabase
    .from("artists")
    .upsert(
      {
        id: payload.spotifyId,
        name: payload.name,
        image_url: payload.image_url,
        ...extras,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (!byId.error && byId.data?.id) return byId.data.id as string;

  if (isUniqueViolation(byName.error) || isUniqueViolation(byId.error)) {
    const existing = await supabase
      .from("artists")
      .select("id")
      .eq("name", payload.name)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
  }

  console.error("[sync-plays] artist resolve failed", payload.name, byName.error, byId.error);
  return null;
}

async function resolveAlbumDbId(
  supabase: SyncDb,
  payload: {
    spotifyId: string;
    name: string;
    artistDbId: string;
    image_url: string | null;
    release_date: string | null;
    album_type: string | null;
    spotify_url: string | null;
  },
): Promise<string | null> {
  const extras = {
    image_url: payload.image_url,
    release_date: payload.release_date,
    album_type: payload.album_type,
    spotify_url: payload.spotify_url,
  };

  const byPair = await supabase
    .from("albums")
    .upsert(
      { name: payload.name, artist_id: payload.artistDbId, ...extras },
      { onConflict: "name,artist_id" },
    )
    .select("id")
    .maybeSingle();

  if (!byPair.error && byPair.data?.id) return byPair.data.id as string;

  const byId = await supabase
    .from("albums")
    .upsert(
      {
        id: payload.spotifyId,
        name: payload.name,
        artist_id: payload.artistDbId,
        ...extras,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (!byId.error && byId.data?.id) return byId.data.id as string;

  if (isUniqueViolation(byPair.error) || isUniqueViolation(byId.error)) {
    const existing = await supabase
      .from("albums")
      .select("id")
      .eq("name", payload.name)
      .eq("artist_id", payload.artistDbId)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
  }

  console.error("[sync-plays] album resolve failed", payload.name, byPair.error, byId.error);
  return null;
}

async function resolveTrackDbId(
  supabase: SyncDb,
  payload: {
    spotifyId: string;
    name: string;
    artistDbId: string;
    albumDbId: string | null;
    duration_ms: number;
    explicit: boolean;
    preview_url: string | null;
    spotify_url: string | null;
    popularity: number | null;
  },
): Promise<string | null> {
  const row = {
    name: payload.name,
    artist_id: payload.artistDbId,
    album_id: payload.albumDbId,
    duration_ms: payload.duration_ms,
    explicit: payload.explicit,
    preview_url: payload.preview_url,
    spotify_url: payload.spotify_url,
    popularity: payload.popularity,
  };

  const bySpotify = await supabase
    .from("tracks")
    .upsert({ spotify_id: payload.spotifyId, ...row }, { onConflict: "spotify_id" })
    .select("id")
    .maybeSingle();

  if (!bySpotify.error && bySpotify.data?.id) return bySpotify.data.id as string;

  const missingSpotifyCol =
    bySpotify.error?.code === "PGRST204" ||
    /spotify_id/i.test(bySpotify.error?.message ?? "");

  if (!missingSpotifyCol && bySpotify.error && !isUniqueViolation(bySpotify.error)) {
    console.error("[sync-plays] track upsert spotify_id", payload.name, bySpotify.error);
  }

  const byId = await supabase
    .from("tracks")
    .upsert(
      { id: payload.spotifyId, ...row },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (!byId.error && byId.data?.id) return byId.data.id as string;

  const existingSpotify = await supabase
    .from("tracks")
    .select("id")
    .eq("spotify_id", payload.spotifyId)
    .maybeSingle();
  if (existingSpotify.data?.id) return existingSpotify.data.id as string;

  const existingId = await supabase
    .from("tracks")
    .select("id")
    .eq("id", payload.spotifyId)
    .maybeSingle();
  if (existingId.data?.id) return existingId.data.id as string;

  console.error("[sync-plays] track resolve failed", payload.name, bySpotify.error, byId.error);
  return null;
}

Deno.serve(async (req) => {
  try {
    console.log("[sync-plays] start", { method: req.method });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

    if (
      !supabaseUrl?.trim() || !supabaseKey?.trim() || !clientId?.trim() ||
      !clientSecret?.trim()
    ) {
      const msg =
        "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET";
      console.error("[sync-plays]", msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log("[sync-plays] step 1: load spotify_tokens");
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("spotify_tokens")
      .select("id, access_token, refresh_token, expires_at")
      .limit(1)
      .single();

    const noRow =
      tokenErr?.code === "PGRST116" ||
      (tokenErr?.message ?? "").includes("0 rows") ||
      (tokenErr?.message ?? "").includes("no rows");

    if (tokenErr && !noRow) {
      console.error("[sync-plays] spotify_tokens query error", tokenErr);
      return new Response(JSON.stringify({ error: String(tokenErr.message) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!tokenRow) {
      console.error("[sync-plays] No spotify_tokens row");
      return new Response(
        JSON.stringify({ ok: true, message: "No spotify_tokens row" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const row = tokenRow as SpotifyTokenRow;
    const refresh = row.refresh_token?.trim();

    if (!refresh) {
      console.error("[sync-plays] refresh_token missing or empty");
      return new Response(
        JSON.stringify({ ok: true, message: "No refresh_token" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log("[sync-plays] step 2: refresh Spotify access token");
    const tokenBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const tokenParsed = await parseJsonSafe(tokenRes) as Record<
      string,
      unknown
    >;

    const newAccess =
      typeof tokenParsed.access_token === "string"
        ? tokenParsed.access_token
        : "";

    if (!tokenRes.ok || !newAccess) {
      console.error(
        "[sync-plays] Token refresh failed — response:",
        JSON.stringify(tokenParsed),
      );
      return new Response(
        JSON.stringify({ error: "Token refresh failed" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const expiresAtIso = new Date(Date.now() + 3600 * 1000).toISOString();
    const { error: tokenUpdateErr } = await supabase
      .from("spotify_tokens")
      .update({
        access_token: newAccess,
        expires_at: expiresAtIso,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (tokenUpdateErr) {
      console.error(
        "[sync-plays] spotify_tokens update failed (continuing in memory)",
        tokenUpdateErr,
      );
    }

    console.log("[sync-plays] step 3: cursor from last live play");
    const { data: lastPlays, error: lastPlayErr } = await supabase
      .from("plays")
      .select("played_at")
      .eq("source", "live")
      .order("played_at", { ascending: false })
      .limit(1);

    if (lastPlayErr) {
      console.error("[sync-plays] last play query failed", lastPlayErr);
      return new Response(JSON.stringify({ error: String(lastPlayErr.message) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let cursorUsed: number;
    const lastPt = lastPlays?.[0]?.played_at;
    if (lastPt) {
      cursorUsed = new Date(lastPt as string).getTime();
    } else {
      cursorUsed = Date.now() - 24 * 60 * 60 * 1000;
    }
    console.log("[sync-plays] cursor_used (ms)", cursorUsed);

    console.log("[sync-plays] step 4: fetch recently-played");
    const recentUrl =
      `${SPOTIFY_API}/me/player/recently-played?limit=50&after=${cursorUsed}`;
    const recentRes = await fetch(recentUrl, {
      headers: { Authorization: `Bearer ${newAccess}` },
    });

    if (recentRes.status === 401) {
      console.error("[sync-plays] Spotify returned 401 (invalid token)");
      return new Response(
        JSON.stringify({ error: "Spotify unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (recentRes.status === 429) {
      const ra = recentRes.headers.get("retry-after");
      console.error("[sync-plays] rate limited 429 retry-after=", ra ?? "(none)");
      return new Response(
        JSON.stringify({ error: "Spotify rate limited", retry_after: ra }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!recentRes.ok) {
      const body = await readResponseBody(recentRes);
      console.error(
        "[sync-plays] recently-played error",
        recentRes.status,
        body,
      );
      return new Response(
        JSON.stringify({ error: "Spotify recently-played failed", status: recentRes.status }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const recentParsed = await parseJsonSafe(recentRes) as {
      items?: Array<Record<string, unknown>>;
    };

    const rawItems = Array.isArray(recentParsed.items)
      ? recentParsed.items
      : [];

    if (rawItems.length === 0) {
      console.log("[sync-plays] No new plays");
      return new Response(
        JSON.stringify({
          message: "No new plays",
          synced: 0,
          inserted: 0,
          skipped: 0,
          cursor_used: cursorUsed,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    type SpotifyArtist = {
      id?: string;
      name?: string;
      external_urls?: { spotify?: string };
    };
    type SpotifyAlbum = {
      id?: string;
      name?: string;
      artists?: SpotifyArtist[];
      images?: { url?: string }[];
      release_date?: string;
      album_type?: string;
      external_urls?: { spotify?: string };
    };
    type SpotifyTrack = {
      id?: string;
      name?: string;
      artists?: SpotifyArtist[];
      album?: SpotifyAlbum;
      duration_ms?: number;
      explicit?: boolean;
      preview_url?: string | null;
      external_urls?: { spotify?: string };
      popularity?: number | null;
    };

    const items = rawItems.filter((it) => {
      const track = it?.track as SpotifyTrack | null | undefined;
      if (!track || track.id == null || String(track.id).trim() === "") {
        return false;
      }
      const tid = track.id as string;
      const alb = track.album;
      const a0 = track.artists?.[0]?.id;
      const albA0 = alb?.artists?.[0]?.id;
      if (!a0 || !alb?.id || !albA0 || track.duration_ms == null) {
        console.log(
          "[sync-plays] skip item missing artist/album/duration",
          tid,
        );
        return false;
      }
      return true;
    });

    if (items.length === 0) {
      console.log("[sync-plays] No new plays after filter");
      return new Response(
        JSON.stringify({
          message: "No new plays",
          synced: 0,
          inserted: 0,
          skipped: 0,
          cursor_used: cursorUsed,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const artistDbBySpotify = new Map<string, string>();
    const albumDbBySpotify = new Map<string, string>();
    const trackDbBySpotify = new Map<string, string>();

    type PlayRow = {
      track_id: string;
      artist_id: string;
      album_id: string | null;
      played_at: string;
      ms_played: number;
      source: "live";
      shuffle: boolean | null;
      offline: boolean | null;
      platform: string;
      reason_start: string | null;
      reason_end: string | null;
    };

    const playsByKey = new Map<string, PlayRow>();
    let skippedGraph = 0;

    for (const it of items) {
      const track = it.track as SpotifyTrack;
      const album = track.album!;
      const primaryArtist = track.artists![0];
      const albumCover = album.images?.[0]?.url ?? null;
      const playedAt = String(it.played_at ?? "");
      if (!playedAt || !track.id || !primaryArtist?.id || !primaryArtist.name) {
        skippedGraph++;
        continue;
      }

      let artistDbId = artistDbBySpotify.get(primaryArtist.id) ?? null;
      if (!artistDbId) {
        artistDbId = await resolveArtistDbId(supabase, {
          spotifyId: primaryArtist.id,
          name: primaryArtist.name,
          image_url: albumCover,
          spotify_url: primaryArtist.external_urls?.spotify ?? null,
        });
        if (artistDbId) artistDbBySpotify.set(primaryArtist.id, artistDbId);
      }
      if (!artistDbId) {
        skippedGraph++;
        continue;
      }

      let albumDbId: string | null = album.id
        ? (albumDbBySpotify.get(album.id) ?? null)
        : null;
      if (!albumDbId && album.id && album.name) {
        albumDbId = await resolveAlbumDbId(supabase, {
          spotifyId: album.id,
          name: album.name,
          artistDbId,
          image_url: albumCover,
          release_date: parseReleaseDate(album.release_date),
          album_type: album.album_type ?? null,
          spotify_url: album.external_urls?.spotify ?? null,
        });
        if (albumDbId) albumDbBySpotify.set(album.id, albumDbId);
      }

      let trackDbId = trackDbBySpotify.get(track.id) ?? null;
      if (!trackDbId) {
        trackDbId = await resolveTrackDbId(supabase, {
          spotifyId: track.id,
          name: track.name ?? "",
          artistDbId,
          albumDbId,
          duration_ms: track.duration_ms ?? 0,
          explicit: track.explicit ?? false,
          preview_url: track.preview_url ?? null,
          spotify_url: track.external_urls?.spotify ?? null,
          popularity: track.popularity ?? null,
        });
        if (trackDbId) trackDbBySpotify.set(track.id, trackDbId);
      }
      if (!trackDbId) {
        skippedGraph++;
        continue;
      }

      const row: PlayRow = {
        track_id: trackDbId,
        artist_id: artistDbId,
        album_id: albumDbId,
        played_at: new Date(playedAt).toISOString(),
        ms_played: track.duration_ms as number,
        source: "live",
        shuffle: null,
        offline: null,
        platform: PLAYBACK_PLATFORM_SPOTIFY_SYNC,
        reason_start: null,
        reason_end: null,
      };
      playsByKey.set(playAtKey(row.track_id, row.played_at), row);
    }

    let playsPayload = Array.from(playsByKey.values());

    // ── Window-based dedup ────────────────────────────────────────────
    // creditLiveListenIfNeeded (app-side) inserts plays with an estimated
    // played_at (Date.now() − progress_ms) that can differ by a few seconds
    // from Spotify's official played_at. The unique index (track_id, played_at)
    // doesn't catch these near-duplicates, so we filter them out here.
    const DEDUP_WINDOW_MS = 3 * 60 * 1000;
    if (playsPayload.length > 0) {
      const times = playsPayload.map((p) => new Date(p.played_at).getTime());
      const minTime = Math.min(...times) - DEDUP_WINDOW_MS;
      const maxTime = Math.max(...times) + DEDUP_WINDOW_MS;
      const trackIds = [...new Set(playsPayload.map((p) => p.track_id))];

      const { data: existingPlays } = await supabase
        .from("plays")
        .select("track_id, played_at")
        .in("track_id", trackIds)
        .gte("played_at", new Date(minTime).toISOString())
        .lte("played_at", new Date(maxTime).toISOString());

      if (existingPlays?.length) {
        const existingMap = new Map<string, number[]>();
        for (const ep of existingPlays) {
          const ms = new Date(ep.played_at as string).getTime();
          const arr = existingMap.get(ep.track_id as string) ?? [];
          arr.push(ms);
          existingMap.set(ep.track_id as string, arr);
        }
        playsPayload = playsPayload.filter((p) => {
          const existing = existingMap.get(p.track_id);
          if (!existing) return true;
          const pMs = new Date(p.played_at).getTime();
          return !existing.some((eMs) => Math.abs(pMs - eMs) < DEDUP_WINDOW_MS);
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────

    console.log("[sync-plays] step 8: upsert plays", {
      candidates: playsPayload.length,
      skipped_graph: skippedGraph,
    });

    let inserted = 0;
    let skipped = skippedGraph;

    const insertOne = async (p: PlayRow) => {
      const { error } = await supabase.from("plays").insert(p);
      if (!error) {
        inserted++;
        return;
      }
      if (isUniqueViolation(error)) {
        skipped++;
        return;
      }
      console.error("[sync-plays] play insert failed", error);
      skipped++;
    };

    if (playsPayload.length > 0) {
      const { error: playsErr } = await supabase.from("plays").upsert(playsPayload, {
        onConflict: "track_id,played_at",
        ignoreDuplicates: true,
      });

      if (playsErr) {
        console.warn(
          "[sync-plays] batch plays upsert failed, inserting one by one",
          playsErr,
        );
        for (const p of playsPayload) await insertOne(p);
      } else {
        inserted = playsPayload.length;
      }
    }

    const synced = playsPayload.length;
    console.log("[sync-plays] step 9: done", {
      synced,
      inserted,
      skipped,
      cursorUsed,
    });

    return new Response(
      JSON.stringify({
        synced,
        inserted,
        skipped,
        cursor_used: cursorUsed,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[sync-plays] unhandled", e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
