"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Radio,
  Clock,
  Upload,
  Music2,
  Menu,
  X,
  Users,
  Library,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/artists", label: "Artistas", icon: Users },
  { href: "/albums", label: "Álbumes", icon: Library },
  { href: "/now-playing", label: "Now Playing", icon: Radio },
  { href: "/history", label: "History", icon: Clock },
  { href: "/import", label: "Import", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
        className="fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-50 min-h-[44px] min-w-[44px] rounded-xl bg-spotify-medium-gray p-2.5 text-white shadow-lg ring-1 ring-white/10 lg:hidden active:bg-white/10"
      >
        <Menu className="mx-auto h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-[min(100vw-2rem,17rem)] flex-col border-r border-white/5 bg-black pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform lg:w-64 lg:shadow-none lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-spotify-light-gray hover:bg-white/5 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 px-5 py-7 sm:px-6 sm:py-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spotify-green">
            <Music2 className="h-5 w-5 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Spotify Stats</h1>
            <p className="text-xs text-spotify-light-gray">Your music data</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 sm:px-3">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors active:opacity-90 sm:min-h-0 sm:rounded-lg sm:py-2.5",
                  isActive
                    ? "bg-spotify-medium-gray text-white"
                    : "text-spotify-light-gray hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5",
                    isActive ? "text-spotify-green" : ""
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 px-5 py-4 sm:px-6">
          <p className="text-xs text-spotify-light-gray/50">
            Spotify Companion Dashboard
          </p>
        </div>
      </aside>
    </>
  );
}
