"use client";

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
        description="Lo que está sonando en tu Spotify en este momento."
        actions={
          <a
            href="/api/spotify/auth"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Conectar Spotify
          </a>
        }
      />

      <div className="max-w-xl">
        <NowPlayingCard variant="full" />
      </div>

      <div className="rounded-xl border border-white/5 bg-spotify-dark-gray p-6">
        <h2 className="mb-2 text-sm font-semibold text-white">Cómo funciona</h2>
        <ol className="space-y-2 text-sm text-spotify-light-gray">
          <li>1. Conecta tu cuenta de Spotify con el botón de arriba.</li>
          <li>2. Pon algo en cualquier dispositivo con Spotify.</li>
          <li>3. La tarjeta se actualiza sola cada 15 segundos.</li>
        </ol>
      </div>
    </div>
  );
}
