"use client";

import { NowPlayingCard } from "@/components/now-playing/now-playing-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogIn, Radio } from "lucide-react";

export default function NowPlayingPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-spotify-green" />
          <div>
            <h1 className="text-2xl font-bold text-white">Now Playing</h1>
            <p className="text-sm text-spotify-light-gray">
              See what&apos;s currently playing on Spotify
            </p>
          </div>
        </div>
        <a
          href="/api/spotify/auth"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Connect Spotify
        </a>
      </div>

      <div className="max-w-lg">
        <NowPlayingCard />
      </div>

      <div className="rounded-xl border border-white/5 bg-spotify-dark-gray p-6">
        <h3 className="mb-2 text-sm font-semibold text-white">How it works</h3>
        <ul className="space-y-2 text-sm text-spotify-light-gray">
          <li>1. Connect your Spotify account using the button above</li>
          <li>2. Play something on any Spotify device</li>
          <li>3. The widget above updates automatically every 15 seconds</li>
        </ul>
      </div>
    </div>
  );
}
