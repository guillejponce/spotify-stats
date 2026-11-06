"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { currentCalendarYearChile } from "@/lib/chile-time";
import type {
  CalendarYearEntry,
  TimeFilter,
  TimeFilterParams,
} from "@/types/database";

interface TimeFilterControlProps {
  value: TimeFilterParams;
  onChange: (params: TimeFilterParams) => void;
  /** Dashboard: períodos rápidos + selector de año/mes específico. Artistas/Álbumes: calendario completo. */
  variant?: "full" | "dashboard";
  /** Actualizando datos en segundo plano (evita skeleton agresivo en el dashboard). */
  busy?: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, i) => currentYear - i);
const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function TimeFilterControl({
  value,
  onChange,
  variant = "full",
  busy = false,
}: TimeFilterControlProps) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    if (value.year != null) setSelectedYear(value.year);
    if (value.month != null) setSelectedMonth(value.month);
  }, [value.year, value.month]);

  const handleFilterChange = (filter: string) => {
    const f = filter as TimeFilter;
    const params: TimeFilterParams = { filter: f };

    if (f === "year") {
      params.year = selectedYear;
    } else if (f === "month") {
      params.year = selectedYear;
      params.month = selectedMonth;
    }

    onChange(params);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    if (value.filter === "year") {
      onChange({ filter: "year", year });
    } else if (value.filter === "month") {
      onChange({ filter: "month", year, month: selectedMonth });
    }
  };

  const handleMonthChange = (month: number) => {
    setSelectedMonth(month);
    if (value.filter === "month") {
      onChange({ filter: "month", year: selectedYear, month });
    }
  };

  if (variant === "dashboard") {
    return (
      <DashboardTimeFilter value={value} onChange={onChange} busy={busy} />
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [touch-action:pan-x]">
        <Tabs defaultValue="all" value={value.filter} onValueChange={handleFilterChange}>
          <TabsList className="inline-flex w-max flex-nowrap gap-1 sm:flex-wrap sm:gap-1">
            <TabsTrigger value="all">Todo</TabsTrigger>
            <TabsTrigger value="year">Año</TabsTrigger>
            <TabsTrigger value="month">Mes</TabsTrigger>
            <TabsTrigger value="week">Esta semana</TabsTrigger>
            <TabsTrigger value="day">Hoy</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-stretch gap-2 sm:items-center sm:gap-3">
        {(value.filter === "year" || value.filter === "month") && (
          <div className="min-w-[8.5rem] flex-1 sm:flex-none sm:max-w-[11rem]">
            <Select
              value={String(selectedYear)}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
          </div>
        )}

        {value.filter === "month" && (
          <div className="min-w-[8.5rem] flex-1 sm:flex-none sm:max-w-[14rem]">
            <Select
              value={String(selectedMonth)}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              options={months.map((m, i) => ({
                value: String(i + 1),
                label: m,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const THIS_YEAR_TAB = "this_year";
const ALL_MONTHS = "0";
/** Atajos 1–5 en el orden de las pestañas. */
const SHORTCUT_TABS = ["all", THIS_YEAR_TAB, "last_6_months", "last_month", "last_week"];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/** Año calendario en curso (Chile) se muestra como la pestaña “Este año”; cualquier otro año/mes vive en los selectores. */
function isThisYear(value: TimeFilterParams): boolean {
  return value.filter === "year" && value.year === currentCalendarYearChile();
}

function DashboardTimeFilter({
  value,
  onChange,
  busy,
}: {
  value: TimeFilterParams;
  onChange: (params: TimeFilterParams) => void;
  busy: boolean;
}) {
  const thisYear = currentCalendarYearChile();
  const [availableYears, setAvailableYears] = useState<number[]>(() =>
    Array.from({ length: 15 }, (_, i) => thisYear - i),
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/years")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { years?: CalendarYearEntry[] } | null) => {
        if (cancelled || !Array.isArray(data?.years)) return;
        const ys = data.years
          .map((e) => Number(e.year))
          .filter((y) => Number.isFinite(y));
        if (!ys.includes(thisYear)) ys.push(thisYear);
        setAvailableYears(Array.from(new Set(ys)).sort((a, b) => b - a));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [thisYear]);

  const isSpecific =
    (value.filter === "year" && !isThisYear(value)) || value.filter === "month";
  const tabValue = isThisYear(value)
    ? THIS_YEAR_TAB
    : isSpecific
      ? ""
      : value.filter;

  const pickedYear = isSpecific ? value.year ?? thisYear : null;
  const pickedMonth =
    value.filter === "month" && value.month != null
      ? String(value.month)
      : ALL_MONTHS;

  const handleTab = (tab: string) => {
    if (tab === THIS_YEAR_TAB) {
      onChange({ filter: "year", year: thisYear });
    } else {
      onChange({ filter: tab as TimeFilter });
    }
  };

  const handleTabRef = useRef(handleTab);
  handleTabRef.current = handleTab;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const tab = SHORTCUT_TABS[Number(e.key) - 1];
      if (!tab) return;
      e.preventDefault();
      handleTabRef.current(tab);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const emitSpecific = (year: number, month: string) => {
    if (month === ALL_MONTHS) onChange({ filter: "year", year });
    else onChange({ filter: "month", year, month: Number(month) });
  };

  const controlClass = "h-9 min-h-0 text-sm";

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2",
          busy && "opacity-90",
        )}
      >
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-x]">
          <Tabs
            defaultValue="all"
            value={tabValue}
            onValueChange={handleTab}
            className="min-w-0"
          >
            <TabsList className="h-9 w-max flex-nowrap gap-0.5 p-0.5">
              <TabsTrigger value="all" title="Atajo: 1" className="h-full px-2.5 py-0 text-xs sm:px-3 sm:text-sm">
                <span className="sm:hidden">Todo</span>
                <span className="hidden sm:inline">Todo el tiempo</span>
              </TabsTrigger>
              <TabsTrigger value={THIS_YEAR_TAB} title="Atajo: 2" className="h-full px-2.5 py-0 text-xs sm:px-3 sm:text-sm">
                <span className="sm:hidden">Año</span>
                <span className="hidden sm:inline">Este año</span>
              </TabsTrigger>
              <TabsTrigger value="last_6_months" title="Atajo: 3" className="h-full px-2.5 py-0 text-xs sm:px-3 sm:text-sm">
                <span className="sm:hidden">6 meses</span>
                <span className="hidden sm:inline">Últimos 6 meses</span>
              </TabsTrigger>
              <TabsTrigger value="last_month" title="Atajo: 4" className="h-full px-2.5 py-0 text-xs sm:px-3 sm:text-sm">
                <span className="sm:hidden">Mes</span>
                <span className="hidden sm:inline">Último mes</span>
              </TabsTrigger>
              <TabsTrigger value="last_week" title="Atajo: 5" className="h-full px-2.5 py-0 text-xs sm:px-3 sm:text-sm">
                <span className="sm:hidden">Semana</span>
                <span className="hidden sm:inline">Última semana</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {busy && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-spotify-green"
            aria-label="Actualizando"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
        <div className="min-w-0 lg:w-[7.75rem]">
          <Select
            aria-label="Año específico"
            value={pickedYear != null ? String(pickedYear) : ""}
            placeholder="Año"
            onChange={(e) => emitSpecific(Number(e.target.value), pickedMonth)}
            className={cn(controlClass, isSpecific && "border-spotify-green/60")}
            options={availableYears.map((y) => ({
              value: String(y),
              label: String(y),
            }))}
          />
        </div>
        <div className="min-w-0 lg:w-[10rem]">
          <Select
            aria-label="Mes específico"
            value={isSpecific ? pickedMonth : ""}
            placeholder="Mes"
            onChange={(e) =>
              emitSpecific(pickedYear ?? thisYear, e.target.value)
            }
            className={cn(controlClass, isSpecific && "border-spotify-green/60")}
            options={[
              { value: ALL_MONTHS, label: "Todo el año" },
              ...months.map((m, i) => ({ value: String(i + 1), label: m })),
            ]}
          />
        </div>
      </div>
    </div>
  );
}
