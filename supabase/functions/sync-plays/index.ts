import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

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

    const artistRowsMap = new Map<string, Record<string, unknown>>();
    const albumRowsMap = new Map<string, Record<string, unknown>>();
    const trackRowsMap = new Map<string, Record<string, unknown>>();

    for (const it of items) {
      const track = it.track as SpotifyTrack;
      const primaryArtist = track.artists?.[0];
      if (primaryArtist?.id && primaryArtist.name) {
        artistRowsMap.set(primaryArtist.id, {
          id: primaryArtist.id,
          name: primaryArtist.name,
          image_url: null,
          spotify_url: primaryArtist.external_urls?.spotify ?? null,
        });
      }
      const album = track.album!;
      const primaryArtistId = album.artists?.[0]?.id!;
      albumRowsMap.set(album.id!, {
        id: album.id,
        name: album.name,
        artist_id: primaryArtistId,
        image_url: album.images?.[0]?.url ?? null,
        release_date: parseReleaseDate(album.release_date),
        album_type: album.album_type ?? null,
        spotify_url: album.external_urls?.spotify ?? null,
      });
      trackRowsMap.set(track.id!, {
        id: track.id,
        name: track.name,
        artist_id: track.artists![0].id!,
        album_id: album.id,
        duration_ms: track.duration_ms,
        explicit: track.explicit ?? false,
        preview_url: track.preview_url ?? null,
        spotify_url: track.external_urls?.spotify ?? null,
        popularity: track.popularity ?? null,
      });
    }

    console.log("[sync-plays] step 5: upsert artists", artistRowsMap.size);
    const artistPayload = [...artistRowsMap.values()];
    if (artistPayload.length > 0) {
      const { error: artistsErr } = await supabase
        .from("artists")
        .upsert(artistPayload, { onConflict: "id", ignoreDuplicates: true });

      if (artistsErr) {
        console.error("[sync-plays] artists upsert failed (FK risk)", artistsErr);
        return new Response(JSON.stringify({ error: String(artistsErr.message) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    console.log("[sync-plays] step 6: upsert albums", albumRowsMap.size);
    const albumPayload = [...albumRowsMap.values()];
    if (albumPayload.length > 0) {
      const { error: albumsErr } = await supabase
        .from("albums")
        .upsert(albumPayload, { onConflict: "id", ignoreDuplicates: true });

      if (albumsErr) {
        console.error("[sync-plays] albums upsert failed", albumsErr);
        return new Response(JSON.stringify({ error: String(albumsErr.message) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    console.log("[sync-plays] step 7: upsert tracks", trackRowsMap.size);
    const trackPayload = [...trackRowsMap.values()];
    if (trackPayload.length > 0) {
      const { error: tracksErr } = await supabase
        .from("tracks")
        .upsert(trackPayload, { onConflict: "id", ignoreDuplicates: true });

      if (tracksErr) {
        console.error("[sync-plays] tracks upsert failed", tracksErr);
        return new Response(JSON.stringify({ error: String(tracksErr.message) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const playsPayloadUnclean = items.map((it) => {
      const track = it.track as SpotifyTrack;
      const album = track.album!;
      return {
        track_id: track.id as string,
        artist_id: track.artists![0].id as string,
        album_id: album.id as string,
        played_at: it.played_at as string,
        ms_played: track.duration_ms as number,
        source: "live" as const,
        shuffle: null as boolean | null,
        offline: null as boolean | null,
        platform: null as string | null,
        reason_start: null as string | null,
        reason_end: null as string | null,
      };
    });

    const playsByKey = new Map<string, (typeof playsPayloadUnclean)[0]>();
    for (const p of playsPayloadUnclean) {
      playsByKey.set(playAtKey(p.track_id, p.played_at), p);
    }
    const playsPayload = [...playsByKey.values()];

    const trackIds = [...new Set(playsPayload.map((p) => p.track_id))];
    const playedAts = [...new Set(playsPayload.map((p) => p.played_at))];

    console.log("[sync-plays] step 8: count existing plays for batch");
    const { data: existingRows, error: existingErr } = await supabase
      .from("plays")
      .select("track_id, played_at")
      .in("track_id", trackIds)
      .in("played_at", playedAts);

    if (existingErr) {
      console.error("[sync-plays] existing plays query failed", existingErr);
      return new Response(JSON.stringify({ error: String(existingErr.message) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const existingSet = new Set(
      (existingRows ?? []).map((r) =>
        playAtKey(r.track_id as string, r.played_at as string)
      ),
    );

    let inserted = 0;
    let skipped = 0;
    for (const p of playsPayload) {
      if (existingSet.has(playAtKey(p.track_id, p.played_at))) skipped++;
      else inserted++;
    }

    console.log(
      "[sync-plays] step 8: upsert plays",
      playsPayload.length,
      "pre-count inserted/skipped",
      inserted,
      skipped,
    );

    const { error: playsErr } = await supabase
      .from("plays")
      .upsert(playsPayload, {
        onConflict: "track_id,played_at",
        ignoreDuplicates: true,
      });

    if (playsErr) {
      console.error("[sync-plays] plays upsert failed", playsErr);
      const msg = String(playsErr.message ?? playsErr);
      if (
        msg.includes("foreign key") || msg.includes("violates foreign key")
      ) {
        console.error(
          "[sync-plays] FK violation — check upsert order (artists → albums → tracks → plays)",
        );
      }
      return new Response(JSON.stringify({ error: msg, details: playsErr }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const synced = playsPayload.length;
    console.log("[sync-plays] step 9: done", { synced, inserted, skipped, cursorUsed });

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
