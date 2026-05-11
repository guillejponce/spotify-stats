import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatMsToHours(ms: number): string {
  const hours = Math.round((ms / 3600000) * 10) / 10;
  return `${hours}h`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export function formatPlayCount(count: number): string {
  return `${formatNumber(count)} plays`;
}

export function extractSpotifyId(uri: string | null): string | null {
  if (!uri) return null;
  const parts = uri.split(":");
  return parts[parts.length - 1] || null;
}

/** Spotify albums use `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; Postgres `date` needs a full ISO day. */
export function normalizeSpotifyAlbumReleaseDate(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function msToMinutes(ms: number): number {
  return Math.round(ms / 60000);
}

export function msToHours(ms: number): number {
  return Math.round((ms / 3600000) * 10) / 10;
}

export function getProgressPercentage(processed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((processed / total) * 100);
}
