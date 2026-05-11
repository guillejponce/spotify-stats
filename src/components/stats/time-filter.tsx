"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TimeFilter, TimeFilterParams } from "@/types/database";

interface TimeFilterControlProps {
  value: TimeFilterParams;
  onChange: (params: TimeFilterParams) => void;
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

export function TimeFilterControl({ value, onChange }: TimeFilterControlProps) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    if (value.year != null) setSelectedYear(value.year);
    if (value.month != null) setSelectedMonth(value.month);
  }, [value.year, value.month]);

  const handleFilterChange = (filter: string) => {
    const params: TimeFilterParams = { filter: filter as TimeFilter };

    if (filter === "year") {
      params.year = selectedYear;
    } else if (filter === "month") {
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs defaultValue="all" value={value.filter} onValueChange={handleFilterChange}>
        <TabsList>
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
