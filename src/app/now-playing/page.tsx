"use client";

import Link from "next/link";
import { NowPlayingCard } from "@/components/now-playing/now-playing-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogIn, Radio } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export default function NowPlayingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Sonando ahora"
        badge={<Radio className="h-5 w-5 text-spotify-green" aria-hidden />}
        description="Lo que está sonando en este momento."
        actions={
          <Link href="/welcome" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <LogIn className="mr-2 h-4 w-4" />
            Conexiones
          </Link>
        }
      />

      <div className="max-w-xl">
        <NowPlayingCard variant="full" />
      </div>

      <div className="rounded-xl border border-white/5 bg-spotify-dark-gray p-6">
        <h2 className="mb-2 text-sm font-semibold text-white">Cómo funciona</h2>
        <ul className="space-y-2 text-sm text-spotify-light-gray">
          <li>Con Spotify conectado se actualiza cada 15 segundos, con progreso y controles.</li>
          <li>
            Con Last.fm se ve la canción que suena, pero sin progreso: Last.fm solo avisa qué está sonando.
          </li>
          <li>
            Si no ves nada, revisa tus{" "}
            <Link href="/welcome" className="text-spotify-green hover:underline">
              conexiones
            </Link>
            .
          </li>
        </ul>
      </div>
    </div>
  );
}
