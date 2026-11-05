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
  Star,
  CalendarDays,
  LogOut,
  Bot,
  Flame,
  Gift,
  Guitar,
  Shield,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/friends/user-avatar";
import { PushNotificationsToggle } from "@/components/push-notifications-toggle";
import { useSession } from "@/components/session-provider";

const navItems: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agent", label: "Kurt CubAIn", icon: Bot, adminOnly: true },
  { href: "/kurt", label: "Racha", icon: Flame },
  { href: "/friends", label: "Amigos", icon: UsersRound },
  { href: "/tracks", label: "Canciones", icon: Music2 },
  { href: "/artists", label: "Artistas", icon: Users },
  { href: "/albums", label: "Álbumes", icon: Library },
  { href: "/ratings", label: "Valoraciones", icon: Star },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/wrapped", label: "Wrapped", icon: Gift },
  { href: "/charts", label: "Cifras", icon: Guitar },
  { href: "/now-playing", label: "Now Playing", icon: Radio },
  { href: "/history", label: "History", icon: Clock },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/admin", label: "Usuarios", icon: Shield, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const session = useSession();
  const isAdmin = session?.role === "admin";
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const [incoming, setIncoming] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/friends/count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { incoming: 0 }))
      .then((d) => {
        if (!cancelled) setIncoming(Number(d.incoming) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
          {visibleItems.map((item) => {
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
                {item.href === "/friends" && incoming > 0 && (
                  <span className="ml-auto rounded-full bg-spotify-green px-2 py-0.5 text-xs font-semibold text-black">
                    {incoming}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 pt-2">
          <PushNotificationsToggle />
          <form action="/auth/logout" method="POST" className="px-2 sm:px-3">
            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-spotify-light-gray transition-colors hover:bg-white/5 hover:text-white active:opacity-90 sm:min-h-0 sm:rounded-lg sm:py-2.5"
            >
              <LogOut className="h-5 w-5" />
              Cerrar sesión
            </button>
          </form>
          <div className="px-2 pb-3 sm:px-3">
            <Link
              href="/profile"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/5 sm:min-h-0 sm:rounded-lg",
                pathname === "/profile" ? "bg-spotify-medium-gray text-white" : "text-spotify-light-gray"
              )}
            >
              {session?.avatarUrl ? (
                <UserAvatar url={session.avatarUrl} name={session.displayName} className="h-7 w-7" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
              <span className="truncate">{session?.displayName ?? session?.email ?? "Mi perfil"}</span>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
