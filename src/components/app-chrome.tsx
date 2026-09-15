"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { AgentDock } from "@/components/agent/agent-dock";
import { cn } from "@/lib/utils";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/unlock") {
    return <>{children}</>;
  }

  const isAgent = pathname === "/agent";

  return (
    <>
      <Sidebar />
      <main
        className={cn(
          "bg-spotify-black lg:pl-64",
          isAgent
            ? "h-[100dvh] overflow-hidden"
            : "min-h-[100dvh] pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div
          className={cn(
            isAgent
              ? "flex h-full min-h-0 flex-col px-3 pb-3 pt-[max(4.25rem,env(safe-area-inset-top)+3rem)] sm:px-4 lg:px-6 lg:py-4 lg:pt-4"
              : "mx-auto max-w-7xl px-3 py-6 pt-[max(4.25rem,env(safe-area-inset-top)+3rem)] sm:px-4 sm:py-8 lg:px-8 lg:pt-8",
          )}
        >
          {children}
        </div>
      </main>
      <AgentDock />
    </>
  );
}
