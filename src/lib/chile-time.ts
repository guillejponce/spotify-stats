import { formatInTimeZone } from "date-fns-tz";

/** Zona mostrada en la app (reproducciones agrupadas y etiquetas). */
export const DISPLAY_TIME_ZONE = "America/Santiago";

const chileDate = (opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({
  ...opts,
  timeZone: DISPLAY_TIME_ZONE,
});

/** `played_at` ISO (timestamptz) → fecha y hora legibles en Chile. */
export function formatChileDateTimeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(
    "es-CL",
    chileDate({
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  ).format(d);
}

/** Fecha civil `YYYY-MM-DD` (mismo criterio que agrupa el backend en Chile) → etiqueta larga. */
export function formatChileCalendarDayLong(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number);
  if (!y || !m || !day) return ymd;
  const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat(
    "es-CL",
    chileDate({
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  ).format(d);
}

/** Etiqueta corta para ejes (mismo día civil). */
export function formatChileCalendarDayShort(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number);
  if (!y || !m || !day) return ymd;
  const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat(
    "es-CL",
    chileDate({
      day: "numeric",
      month: "short",
    })
  ).format(d);
}

/** Rótulo de franja horaria para el gráfico por hora (0–23 en Chile). */
export function formatChileHourSlotLabel(hour: number): string {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:00–${pad(h)}:59`;
}

export const CHILE_WEEKDAY_ROWS = [
  "Dom",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
] as const;

export const CHILE_TIMEZONE_LABEL = "Chile (America/Santiago)";

/** Año civil actual en Chile (heatmap / etiquetas cuando no hay selector). */
export function currentCalendarYearChile(reference = new Date()): number {
  return Number(formatInTimeZone(reference, DISPLAY_TIME_ZONE, "yyyy"));
}

/** `YYYY-MM` (bucket Chile) → etiqueta corta localizada. */
export function formatChileMonthPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return period;
  const d = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat(
    "es-CL",
    chileDate({ month: "short", year: "numeric" }),
  ).format(d);
}

/** Días del año civil (para alinear celdas del heatmap con `YYYY-MM-DD` del servidor). */
export function* eachYmdInGregorianYear(year: number): Generator<string> {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(Date.UTC(year, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      yield `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
}

/** Día de la semana (0=domingo) del 1 de enero — calendario gregoriano. */
export function utcWeekdayJan1(year: number): number {
  return new Date(Date.UTC(year, 0, 1, 12, 0, 0)).getUTCDay();
}
