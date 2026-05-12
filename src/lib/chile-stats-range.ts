import { addDays, subMonths } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
import type { TimeFilterParams } from "@/types/database";

/** Inicio del día civil YYYY-MM-DD en Chile → instante UTC (ISO). */
export function chileYmdStartUtcIso(ymd: string): string {
  return fromZonedTime(`${ymd}T00:00:00.000`, DISPLAY_TIME_ZONE).toISOString();
}

/** Fin del día civil YYYY-MM-DD en Chile → instante UTC (ISO). */
export function chileYmdEndUtcIso(ymd: string): string {
  return fromZonedTime(`${ymd}T23:59:59.999`, DISPLAY_TIME_ZONE).toISOString();
}

/** Si el fin del rango queda después del instante de referencia, recorta (alinea “hasta ahora”). */
export function clipUtcEndAtNow(
  isoUtc: string,
  referenceNow: Date = new Date(),
): string {
  const t = Date.parse(isoUtc);
  if (!Number.isFinite(t)) return isoUtc;
  const n = referenceNow.getTime();
  return t > n ? referenceNow.toISOString() : isoUtc;
}

function todayYmdChile(now: Date): string {
  return formatInTimeZone(now, DISPLAY_TIME_ZONE, "yyyy-MM-dd");
}

function lastDayOfMonthGregorian(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Rangos `start`/`end` en ISO UTC para filtrar `played_at` (timestamptz),
 * alineados al calendario de Chile (no medianoche UTC).
 */
export function buildDateFilterChile(params: TimeFilterParams): {
  start: string;
  end: string;
} {
  const now = new Date();

  switch (params.filter) {
    case "last_week": {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    case "last_month": {
      return {
        start: subMonths(now, 1).toISOString(),
        end: now.toISOString(),
      };
    }
    case "last_6_months": {
      return {
        start: subMonths(now, 6).toISOString(),
        end: now.toISOString(),
      };
    }
    case "year": {
      const y =
        params.year ??
        Number(formatInTimeZone(now, DISPLAY_TIME_ZONE, "yyyy"));
      return {
        start: chileYmdStartUtcIso(`${y}-01-01`),
        end: clipUtcEndAtNow(chileYmdEndUtcIso(`${y}-12-31`), now),
      };
    }
    case "month": {
      const y =
        params.year ??
        Number(formatInTimeZone(now, DISPLAY_TIME_ZONE, "yyyy"));
      const m =
        params.month ??
        Number(formatInTimeZone(now, DISPLAY_TIME_ZONE, "MM"));
      const last = lastDayOfMonthGregorian(y, m);
      const mm = String(m).padStart(2, "0");
      const dd = String(last).padStart(2, "0");
      return {
        start: chileYmdStartUtcIso(`${y}-${mm}-01`),
        end: clipUtcEndAtNow(chileYmdEndUtcIso(`${y}-${mm}-${dd}`), now),
      };
    }
    case "week": {
      const ymd = todayYmdChile(now);
      const midday = fromZonedTime(`${ymd}T12:00:00.000`, DISPLAY_TIME_ZONE);
      const isoDow = Number(
        formatInTimeZone(midday, DISPLAY_TIME_ZONE, "i")
      );
      const offsetFromSunday = isoDow === 7 ? 0 : isoDow;
      const weekStartInstant = addDays(midday, -offsetFromSunday);
      const weekStartYmd = formatInTimeZone(
        weekStartInstant,
        DISPLAY_TIME_ZONE,
        "yyyy-MM-dd"
      );
      const weekEndInstant = addDays(
        fromZonedTime(
          `${weekStartYmd}T12:00:00.000`,
          DISPLAY_TIME_ZONE
        ),
        6
      );
      const weekEndYmd = formatInTimeZone(
        weekEndInstant,
        DISPLAY_TIME_ZONE,
        "yyyy-MM-dd"
      );
      return {
        start: chileYmdStartUtcIso(weekStartYmd),
        end: clipUtcEndAtNow(chileYmdEndUtcIso(weekEndYmd), now),
      };
    }
    case "day": {
      const ymd = params.startDate ?? todayYmdChile(now);
      return {
        start: chileYmdStartUtcIso(ymd),
        end: clipUtcEndAtNow(chileYmdEndUtcIso(ymd), now),
      };
    }
    default:
      return {
        start: "1970-01-01T00:00:00.000Z",
        end: now.toISOString(),
      };
  }
}
