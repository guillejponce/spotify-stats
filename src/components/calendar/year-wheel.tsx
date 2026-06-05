"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface YearWheelProps {
  years: number[];
  selectedYear: number;
  onChange: (year: number) => void;
  className?: string;
}

const ITEM_W = 88;
const COMMIT_MS = 160;

export function YearWheel({
  years,
  selectedYear,
  onChange,
  className,
}: YearWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [centeredYear, setCenteredYear] = useState(selectedYear);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();
  const selfChange = useRef(false);
  const mounted = useRef(false);

  const detectCenter = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return years[0] ?? selectedYear;
    const cx = el.getBoundingClientRect().left + el.clientWidth / 2;
    let best = years[0] ?? selectedYear;
    let bestD = Infinity;
    itemRefs.current.forEach((btn, yr) => {
      const r = btn.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bestD) {
        bestD = d;
        best = yr;
      }
    });
    return best;
  }, [years, selectedYear]);

  const scrollTo = useCallback(
    (yr: number, behavior: ScrollBehavior) => {
      const el = scrollRef.current;
      const btn = itemRefs.current.get(yr);
      if (!el || !btn) return;
      el.scrollTo({
        left: btn.offsetLeft + btn.offsetWidth / 2 - el.clientWidth / 2,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const yr = detectCenter();
        setCenteredYear(yr);

        clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => {
          if (yr !== selectedYear) {
            selfChange.current = true;
            onChange(yr);
          }
        }, COMMIT_MS);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(commitTimer.current);
    };
  }, [detectCenter, selectedYear, onChange]);

  useEffect(() => {
    if (selfChange.current) {
      selfChange.current = false;
      return;
    }
    setCenteredYear(selectedYear);
    requestAnimationFrame(() => {
      scrollTo(selectedYear, mounted.current ? "smooth" : "instant");
      mounted.current = true;
    });
  }, [selectedYear, scrollTo]);

  const handleClick = (yr: number) => {
    setCenteredYear(yr);
    scrollTo(yr, "smooth");
    clearTimeout(commitTimer.current);
    selfChange.current = true;
    onChange(yr);
  };

  if (!years.length) return null;

  const ci = years.indexOf(centeredYear);

  return (
    <div className={cn("relative select-none", className)}>
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-spotify-black to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-spotify-black to-transparent sm:w-28" />

      {/* Center needle — top arrow */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
        <svg
          width="14"
          height="7"
          viewBox="0 0 14 7"
          className="text-spotify-green drop-shadow-[0_0_4px_rgba(29,185,84,0.45)]"
        >
          <polygon points="7,7 0,0 14,0" fill="currentColor" />
        </svg>
      </div>
      {/* Center needle — bottom arrow */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 -translate-x-1/2">
        <svg
          width="14"
          height="7"
          viewBox="0 0 14 7"
          className="text-spotify-green drop-shadow-[0_0_4px_rgba(29,185,84,0.45)]"
        >
          <polygon points="7,0 14,7 0,7" fill="currentColor" />
        </svg>
      </div>

      {/* Scroll track */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {/* Leading spacer so the first year can reach center */}
        <div
          className="shrink-0"
          style={{ width: `calc(50% - ${ITEM_W / 2}px)` }}
        />

        {years.map((year, i) => {
          const dist = ci >= 0 ? Math.abs(i - ci) : 0;
          const isActive = year === centeredYear;

          return (
            <button
              key={year}
              ref={(el) => {
                if (el) itemRefs.current.set(year, el);
                else itemRefs.current.delete(year);
              }}
              data-year={year}
              onClick={() => handleClick(year)}
              className="flex shrink-0 flex-col items-center justify-center py-3.5"
              style={{
                width: ITEM_W,
                scrollSnapAlign: "center",
                transform: `scale(${Math.max(0.72, 1 - dist * 0.07)})`,
                opacity: Math.max(0.2, 1 - dist * 0.22),
                transition:
                  "transform 150ms ease-out, opacity 150ms ease-out",
              }}
            >
              <span
                className={cn(
                  "text-xl font-bold tabular-nums sm:text-2xl",
                  isActive
                    ? "text-spotify-green"
                    : "text-spotify-light-gray",
                )}
              >
                {year}
              </span>
              <span
                className="mt-1 h-1 w-8 rounded-full bg-spotify-green"
                style={{
                  opacity: isActive ? 1 : 0,
                  transition: "opacity 150ms ease-out",
                }}
              />
            </button>
          );
        })}

        {/* Trailing spacer */}
        <div
          className="shrink-0"
          style={{ width: `calc(50% - ${ITEM_W / 2}px)` }}
        />
      </div>
    </div>
  );
}
