/**
 * Etiquetas legibles para `plays.platform` y `plays.source` en la UI (DB guarda valores técnicos).
 */

/** Valor en DB para sync vía Recently Played (API no indica dispositivo). */
export const PLAYBACK_PLATFORM_SPOTIFY_SYNC = "spotify_recent_api" as const;

export function formatPlaybackPlatform(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  const lower = s.toLowerCase();

  if (
    !s ||
    lower === "(unknown)" ||
    lower === "unknown" ||
    lower === "null"
  ) {
    return "Sin detalle de dispositivo";
  }

  if (lower === PLAYBACK_PLATFORM_SPOTIFY_SYNC) {
    return "Últimos escuchados (API Spotify)";
  }

  /* Export extendido suele usar slugs tipo ANDROID_TV o IPHONE_IOS */
  if (/^[a-z0-9_/]+$/i.test(s.replace(/\s+/g, "")) && /[_\/]/.test(s)) {
    return humanizeDeviceSlug(s);
  }

  return s;
}

/** `plays.source`: live vs archivo export vs otros. */
export function formatPlaybackSource(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s === "null") return "Sin clasificar";
  if (s === "live") return "Últimos escuchados (sync)";
  if (s === "spotify_export") return "Histórico (export Spotify)";
  return String(raw ?? "").trim();
}

function humanizeDeviceSlug(s: string): string {
  return s
    .replace(/\//g, " · ")
    .split(/[_]+/)
    .filter(Boolean)
    .map((chunk) =>
      chunk.length <= 3
        ? chunk.toUpperCase()
        : chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase(),
    )
    .join(" ");
}
