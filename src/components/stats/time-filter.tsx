"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TimeFilter, TimeFilterParams } from "@/types/database";

interface TimeFilterControlProps {
  value: TimeFilterParams;
  onChange: (params: TimeFilterParams) => void;
  /** Dashboard: solo períodos rolantes rápidos. Artistas/Álbumes: calendario completo. */
  variant?: "full" | "dashboard";
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
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          defaultValue="all"
          value={value.filter}
          onValueChange={handleFilterChange}
        >
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">Todo el tiempo</TabsTrigger>
            <TabsTrigger value="last_6_months">Últimos 6 meses</TabsTrigger>
            <TabsTrigger value="last_month">Último mes</TabsTrigger>
            <TabsTrigger value="last_week">Última semana</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs defaultValue="all" value={value.filter} onValueChange={handleFilterChange}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">Todo</TabsTrigger>
          <TabsTrigger value="year">Año</TabsTrigger>
          <TabsTrigger value="month">Mes</TabsTrigger>
          <TabsTrigger value="week">Esta semana</TabsTrigger>
          <TabsTrigger value="day">Hoy</TabsTrigger>
        </TabsList>
      </Tabs>

      {(value.filter === "year" || value.filter === "month") && (
        <Select
          value={String(selectedYear)}
          onChange={(e) => handleYearChange(Number(e.target.value))}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
      )}

      {value.filter === "month" && (
        <Select
          value={String(selectedMonth)}
          onChange={(e) => handleMonthChange(Number(e.target.value))}
          options={months.map((m, i) => ({
            value: String(i + 1),
            label: m,
          }))}
        />
      )}
    </div>
  );
}
