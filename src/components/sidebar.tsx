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
  Ticket,
  UserRound,
  UsersRound,
  ChevronDown,
  Disc3,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/friends/user-avatar";
import { PushNotificationsToggle } from "@/components/push-notifications-toggle";
import { useSession } from "@/components/session-provider";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

const pinnedItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/now-playing", label: "Sonando ahora", icon: Radio },
];

const navGroups: NavGroup[] = [
  {
    id: "library",
    label: "Biblioteca",
    icon: Library,
    items: [
      { href: "/tracks", label: "Canciones", icon: Music2 },
      { href: "/artists", label: "Artistas", icon: Users },
      { href: "/albums", label: "Álbumes", icon: Disc3 },
      { href: "/ratings", label: "Valoraciones", icon: Star },
    ],
  },
  {
    id: "history",
    label: "Historial",
    icon: Clock,
    items: [
      { href: "/history", label: "Reproducciones", icon: Clock },
      { href: "/calendar", label: "Calendario", icon: CalendarDays },
      { href: "/wrapped", label: "Wrapped", icon: Gift },
    ],
  },
  {
    id: "social",
    label: "Social",
    icon: UsersRound,
    items: [
      { href: "/friends", label: "Amigos", icon: UsersRound },
      { href: "/concerts", label: "Conciertos", icon: Ticket },
      { href: "/kurt", label: "Racha", icon: Flame },
    ],
  },
  {
    id: "analysis",
    label: "Análisis",
    icon: Wrench,
    items: [
      { href: "/charts", label: "Cifras", icon: Guitar },
    ],
  },
  {
    id: "tools",
    label: "Herramientas",
    icon: Wrench,
    items: [
      { href: "/agent", label: "Kurt CubAIn", icon: Bot, adminOnly: true },
      { href: "/import", label: "Importar", icon: Upload },
      { href: "/admin", label: "Usuarios", icon: Shield, adminOnly: true },
    ],
  },
];

const OPEN_GROUPS_KEY = "sidebar:open-groups";

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const itemClass = (active: boolean) =>
  cn(
    "flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors active:opacity-90 sm:min-h-0 sm:rounded-lg sm:py-2.5",
    active
      ? "bg-spotify-medium-gray text-white"
      : "text-spotify-light-gray hover:bg-white/5 hover:text-white"
  );

function IncomingBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto rounded-full bg-spotify-green px-2 py-0.5 text-xs font-semibold text-black">
      {count}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const session = useSession();
  const isAdmin = session?.role === "admin";
  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((g) => g.items.length > 0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? "[]");
      if (Array.isArray(saved)) setOpenGroups(new Set(saved.map(String)));
    } catch {}
  }, []);

  useEffect(() => {
    const activeGroup = navGroups.find((g) =>
      g.items.some((item) => isActivePath(pathname, item.href))
    );
    if (!activeGroup) return;
    setOpenGroups((prev) =>
      prev.has(activeGroup.id) ? prev : new Set(prev).add(activeGroup.id)
    );
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

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
            <p className="text-lg font-bold text-white">Statsify</p>
            <p className="text-xs text-spotify-light-gray">Tus datos de música</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 sm:px-3">
          {pinnedItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={itemClass(isActive)}
              >
                <item.icon className={cn("h-5 w-5", isActive && "text-spotify-green")} />
                {item.label}
              </Link>
            );
          })}

          {visibleGroups.map((group) => {
            const open = openGroups.has(group.id);
            const groupActive = group.items.some((item) =>
              isActivePath(pathname, item.href)
            );
            const groupIncoming = group.items.some((i) => i.href === "/friends")
              ? incoming
              : 0;

            return (
              <div key={group.id} className="pt-1">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-white/5 hover:text-white active:opacity-90 sm:min-h-0 sm:rounded-lg sm:py-2.5",
                    groupActive && !open ? "text-white" : "text-spotify-light-gray"
                  )}
                >
                  <group.icon
                    className={cn("h-5 w-5", groupActive && !open && "text-spotify-green")}
                  />
                  {group.label}
                  {!open && groupIncoming > 0 && <IncomingBadge count={groupIncoming} />}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      !(!open && groupIncoming > 0) && "ml-auto",
                      open && "rotate-180"
                    )}
                  />
                </button>

                {open && (
                  <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/[0.08] pl-2">
                    {group.items.map((item) => {
                      const isActive = isActivePath(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={itemClass(isActive)}
                        >
                          <item.icon
                            className={cn("h-4 w-4", isActive && "text-spotify-green")}
                          />
                          {item.label}
                          {item.href === "/friends" && incoming > 0 && (
                            <IncomingBadge count={incoming} />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
