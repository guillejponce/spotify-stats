import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSpotifyArtistsByIdsWithTokenFallback,
  getSpotifyClientCredentialsToken,
} from "@/lib/spotify";

/** Spotify track/artist IDs are 22-character base62 strings */
const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/;

type AlbumImageRel =
  | { image_url?: string | null }
  | { image_url?: string | null }[]
  | null
  | undefined;

function albumImageUrl(album: AlbumImageRel): string | null {
  if (!album) return null;
  const img = Array.isArray(album) ? album[0]?.image_url : album.image_url;
  return img ?? null;
}

/**
 * Fills missing `artists.image_url` from:
 * 1) Portada del último álbum/single escuchado (o cualquier álbum del artista)
 * 2) GET /artists de Spotify para ids válidos
 *
 * Usa Client Credentials (`client_credentials`) para catálogo; si falla, prueba `fallbackUserAccessToken`.
 */
export async function enrichArtistsMissingImages(
  supabase: SupabaseClient,
  fallbackUserAccessToken?: string | null,
  maxPerRun = 48
): Promise<number> {
  const { data: rows, error } = await supabase
    .from("artists")
    .select("id")
    .is("image_url", null)
    .limit(maxPerRun);

  if (error || !rows?.length) return 0;

  const ids = Array.from(
    new Set(
      rows
        .map((r) => r.id as string | undefined)
        .filter((id): id is string => !!id)
    )
  );
  if (ids.length === 0) return 0;

  let enriched = 0;
  const stillMissing: string[] = [];

  for (const id of ids) {
    const cover = await findAlbumCoverForArtist(supabase, id);
    if (!cover) {
      stillMissing.push(id);
      continue;
    }
    const { error: updErr } = await supabase
      .from("artists")
      .update({ image_url: cover })
      .eq("id", id)
      .is("image_url", null);
    if (!updErr) enriched++;
    else stillMissing.push(id);
  }

  const spotifyIds = stillMissing.filter((id) => SPOTIFY_ID_RE.test(id));
  if (spotifyIds.length === 0) return enriched;

  const cc = await getSpotifyClientCredentialsToken();
  /** Preferir token de usuario: en algunos proyectos Spotify acepta ese para catálogo y devuelve 403 con client_credentials. */
  const tokens = [
    fallbackUserAccessToken,
    cc,
  ] as (string | null | undefined)[];
  if (!tokens.some(Boolean)) {
    console.warn(
      "[enrich-artist-images] Sin token Spotify: definí CLIENT_ID + SECRET o conectá cuenta."
    );
    return enriched;
  }

  const artists = await getSpotifyArtistsByIdsWithTokenFallback(
    spotifyIds,
    tokens
  );
  if (artists.length === 0) return enriched;

  for (const a of artists) {
    const img = a.images?.[0]?.url;
    if (!img) continue;
    const patch: { image_url: string; spotify_url?: string } = {
      image_url: img,
    };
    if (a.external_urls?.spotify) {
      patch.spotify_url = a.external_urls.spotify;
    }
    const { error: updErr } = await supabase
      .from("artists")
      .update(patch)
      .eq("id", a.id)
      .is("image_url", null);
    if (!updErr) enriched++;
  }

  return enriched;
}

/** Portada del último play con álbum, o cualquier álbum/track del artista. */
export async function findAlbumCoverForArtist(
  supabase: SupabaseClient,
  artistId: string
): Promise<string | null> {
  const { data: recentPlays } = await supabase
    .from("plays")
    .select("track_id")
    .eq("artist_id", artistId)
    .not("track_id", "is", null)
    .order("played_at", { ascending: false })
    .limit(25);

  if (recentPlays?.length) {
    const trackIds = recentPlays
      .map((p) => p.track_id as string | null)
      .filter((id): id is string => !!id);

    if (trackIds.length) {
      const { data: tracks } = await supabase
        .from("tracks")
        .select("id, album_id, albums(image_url)")
        .in("id", trackIds);

      const byId = new Map(
        (tracks ?? []).map((t) => [t.id as string, t] as const)
      );
      for (const tid of trackIds) {
        const img = albumImageUrl(
          byId.get(tid)?.albums as AlbumImageRel
        );
        if (img) return img;
      }
    }
  }

  const { data: album } = await supabase
    .from("albums")
    .select("image_url")
    .eq("artist_id", artistId)
    .not("image_url", "is", null)
    .limit(1)
    .maybeSingle();

  if (album?.image_url) return album.image_url as string;

  const { data: viaTrack } = await supabase
    .from("tracks")
    .select("albums(image_url)")
    .eq("artist_id", artistId)
    .not("album_id", "is", null)
    .limit(20);

  for (const row of viaTrack ?? []) {
    const img = albumImageUrl(row.albums as AlbumImageRel);
    if (img) return img;
  }

  return null;
}
