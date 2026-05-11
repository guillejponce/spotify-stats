"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMs } from "@/lib/utils";
import { Music2, ChevronLeft, ChevronRight } from "lucide-react";

interface HistoryPlay {
  id: string;
  played_at: string;
  ms_played: number;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  image_url: string | null;
}

export default function HistoryPage() {
  const [plays, setPlays] = useState<HistoryPlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?offset=${page * limit}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setPlays(data.plays || []);
        setHasMore((data.plays || []).length === limit);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Listening History</h1>
        <p className="text-sm text-spotify-light-gray">
          Browse your past plays
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Plays</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : plays.length === 0 ? (
            <p className="py-8 text-center text-sm text-spotify-light-gray">
              No listening history found. Import your data to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {plays.map((play) => (
                <div
                  key={play.id}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                >
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                    {play.image_url ? (
                      <Image
                        src={play.image_url}
                        alt={play.track_name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-spotify-medium-gray">
                        <Music2 className="h-4 w-4 text-spotify-light-gray" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {play.track_name}
                    </p>
                    <p className="truncate text-xs text-spotify-light-gray">
                      {play.artist_name}
                      {play.album_name && ` · ${play.album_name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-spotify-light-gray">
                      {formatMs(play.ms_played)}
                    </p>
                    <p className="text-[10px] text-spotify-light-gray/60">
                      {new Date(play.played_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-xs text-spotify-light-gray">
              Page {page + 1}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
