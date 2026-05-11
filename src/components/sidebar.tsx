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
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/artists", label: "Artistas", icon: Users },
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
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-spotify-medium-gray p-2 text-white lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-white/5 bg-black transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 text-spotify-light-gray lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 px-6 py-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spotify-green">
            <Music2 className="h-5 w-5 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Spotify Stats</h1>
            <p className="text-xs text-spotify-light-gray">Your music data</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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

        <div className="border-t border-white/5 px-6 py-4">
          <p className="text-xs text-spotify-light-gray/50">
            Spotify Companion Dashboard
          </p>
        </div>
      </aside>
    </>
  );
}
