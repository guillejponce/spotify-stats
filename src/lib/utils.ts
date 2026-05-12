import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 48) {
    const days = Math.floor(ms / 86400000);
    const remH = Math.floor((ms % 86400000) / 3600000);
    return `${days}d ${remH}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/** Subtítulo para KPI de tiempo total: prioriza días si hay muchas horas acumuladas. */
export function formatListeningTimeSubtitle(ms: number): string {
  const hours = ms / 3600000;
  if (hours >= 48) {
    const days = ms / 86400000;
    const label =
      days >= 10 ? `${Math.round(days)} días` : `${Math.round(days * 10) / 10} días`;
    return `≈ ${label} de escucha`;
  }
  return `${Math.round(hours)} h de escucha`;
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

/** Conteos de reproducciones/segmentos: valor exacto con miles (es-CL), sin abreviar tipo 1.2K. */
export function formatReproductionCount(num: number): string {
  const n = Math.floor(Number(num));
  if (!Number.isFinite(n)) return "0";
  return Math.max(0, n).toLocaleString("es-CL");
}

export function formatPlayCount(count: number): string {
  return `${formatReproductionCount(count)} reproducciones`;
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
