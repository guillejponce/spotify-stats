"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Period filter sticks flush to the top of the phone, as a full-width bar
 * with a hole on the left for the hamburger. Desktop: stays in normal flow.
 *
 * On iPhone (viewport-fit: cover + status bar translucido) `top: 0` still
 * leaves a strip above the bar where overscroll shows through. A bleed
 * block paints the same black above the viewport.
 */
export function DashboardPeriodBar({ children }: { children: ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  const [barH, setBarH] = useState(52);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (isDesktop()) {
          setStuck(false);
          return;
        }
        setStuck(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(node);

    const onResize = () => {
      if (isDesktop()) setStuck(false);
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stuck]);

  return (
    <>
      <div ref={sentinelRef} className="h-px lg:hidden" aria-hidden />
      {stuck ? (
        <div className="lg:hidden" style={{ height: barH }} aria-hidden />
      ) : null}
      <section
        ref={barRef}
        className={cn(
          "z-40 min-w-0",
          stuck
            ? [
                "fixed left-0 right-0 top-0",
                "border-b border-white/[0.08] bg-spotify-black",
                "flex min-h-[44px] items-center",
                "pb-2 pr-3",
                "pl-[max(4.5rem,calc(env(safe-area-inset-left)+4rem))]",
                "pt-[max(1rem,env(safe-area-inset-top))]",
              ].join(" ")
            : "relative",
          "lg:!static lg:!inset-auto lg:!z-auto lg:!border-0 lg:!bg-transparent lg:!p-0 lg:!pl-0",
        )}
      >
        {stuck ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-full h-[100dvh] bg-spotify-black lg:hidden"
          />
        ) : null}
        {children}
      </section>
    </>
  );
}
