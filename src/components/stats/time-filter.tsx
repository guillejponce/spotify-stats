"use client";

import { useState } from "react";
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
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function TimeFilterControl({ value, onChange }: TimeFilterControlProps) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

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
      <Tabs defaultValue="all" onValueChange={handleFilterChange}>
        <TabsList>
          <TabsTrigger value="all">All Time</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="day">Today</TabsTrigger>
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
