"use client";

import { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface YearWheelProps {
  years: number[];
  selectedYear: number;
  onChange: (year: number) => void;
  className?: string;
}

const ITEM_WIDTH = 80;

export function YearWheel({ years, selectedYear, onChange, className }: YearWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();

  const scrollToYear = useCallback(
    (year: number, behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = years.indexOf(year);
      if (idx === -1) return;
      const center = idx * ITEM_WIDTH + ITEM_WIDTH / 2 - el.clientWidth / 2;
      el.scrollTo({ left: center, behavior });
    },
    [years],
  );

  useEffect(() => {
    scrollToYear(selectedYear, "instant");
  }, [selectedYear, scrollToYear]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      isUserScrolling.current = true;
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        isUserScrolling.current = false;
        const center = el.scrollLeft + el.clientWidth / 2;
        const idx = Math.round((center - ITEM_WIDTH / 2) / ITEM_WIDTH);
        const clamped = Math.max(0, Math.min(years.length - 1, idx));
        if (years[clamped] !== selectedYear) {
          onChange(years[clamped]);
        }
      }, 100);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [years, selectedYear, onChange]);

  if (years.length === 0) return null;

  const paddingPx = `calc(50% - ${ITEM_WIDTH / 2}px)`;

  return (
    <div className={cn("relative select-none", className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-spotify-black to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-spotify-black to-transparent sm:w-24" />

      {/* Center indicator line */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full w-px -translate-x-1/2 bg-spotify-green/30" />

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        <div className="shrink-0" style={{ width: paddingPx }} />
        {years.map((year) => {
          const active = year === selectedYear;
          return (
            <button
              key={year}
              onClick={() => {
                onChange(year);
                scrollToYear(year);
              }}
              className={cn(
                "flex shrink-0 snap-center flex-col items-center justify-center py-4 transition-all duration-200",
                active
                  ? "scale-110 text-spotify-green"
                  : "text-spotify-light-gray/50 hover:text-spotify-light-gray",
              )}
              style={{ width: ITEM_WIDTH }}
            >
              <span
                className={cn(
                  "text-lg font-bold tabular-nums transition-all duration-200 sm:text-xl",
                  active && "text-2xl sm:text-3xl",
                )}
              >
                {year}
              </span>
              {active && (
                <span className="mt-0.5 h-1 w-6 rounded-full bg-spotify-green" />
              )}
            </button>
          );
        })}
        <div className="shrink-0" style={{ width: paddingPx }} />
      </div>
    </div>
  );
}
