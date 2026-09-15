"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, X } from "lucide-react";
import { AgentChat } from "@/components/agent/agent-chat";
import { cn } from "@/lib/utils";

export function AgentDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname === "/agent" || pathname === "/unlock") return null;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:bg-transparent"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-50 flex flex-col items-end gap-3">
        {open ? (
          <div
            className="pointer-events-auto flex h-[min(34rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col rounded-2xl border border-white/10 bg-spotify-dark-gray p-3 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <AgentChat variant="dock" onClose={() => setOpen(false)} />
          </div>
        ) : null}

        <button
          type="button"
          aria-label={open ? "Cerrar DJ" : "Abrir DJ"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-black shadow-lg shadow-black/40 transition hover:scale-105",
            open ? "bg-white" : "bg-spotify-green",
          )}
        >
          {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}
