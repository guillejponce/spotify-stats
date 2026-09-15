"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/unlock") {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="min-h-[100dvh] bg-spotify-black pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:pl-64">
        <div className="mx-auto max-w-7xl px-3 py-6 pt-[max(4.25rem,env(safe-area-inset-top)+3rem)] sm:px-4 sm:py-8 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>
    </>
  );
}
