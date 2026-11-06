"use client";

import { useEffect, useMemo, useState } from "react";
import { ConcertDashboard } from "@/components/concerts/concert-dashboard";
import { buildConcertStats } from "@/lib/concert-stats";
import { setlistHasSongs, type RawSetlist } from "@/lib/setlistfm";

const BATCH = 6;

function missingIds(rows: RawSetlist[]): string[] {
  return rows.filter((setlist) => setlist.id && !setlistHasSongs(setlist)).map((setlist) => setlist.id as string);
}

export function ConcertsLive({
  setlists: initial,
  partial,
}: {
  setlists: RawSetlist[];
  partial: boolean;
}) {
  const [setlists, setSetlists] = useState(initial);
  const [loaded, setLoaded] = useState(0);
  const [pending, setPending] = useState(() => missingIds(initial).length);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const missing = missingIds(initial);
    if (!missing.length) return;

    let cancelled = false;
    setPending(missing.length);

    async function run() {
      const byId = new Map(initial.map((setlist) => [setlist.id, setlist]));
      for (let index = 0; index < missing.length; index += BATCH) {
        const ids = missing.slice(index, index + BATCH);
        let attempt = 0;
        let batch: RawSetlist[] = [];
        while (attempt < 3) {
          const response = await fetch("/api/concerts/setlists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
          const data = (await response.json()) as { setlists?: RawSetlist[]; retry?: boolean; error?: string };
          if (!response.ok) {
            if (!cancelled) setFailed(true);
            return;
          }
          batch = data.setlists ?? [];
          if (!data.retry) break;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        for (const row of batch) {
          if (row.id) byId.set(row.id, row);
        }
        if (cancelled) return;
        setSetlists(Array.from(byId.values()).filter((row): row is RawSetlist => Boolean(row)));
        setLoaded((count) => count + ids.length);
      }
      if (!cancelled) setPending(0);
    }

    run().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const stats = useMemo(() => buildConcertStats(setlists), [setlists]);
  const loadingSongs = pending > 0 && loaded < pending;

  return (
    <div className="space-y-4">
      {loadingSongs && (
        <p className="text-sm text-spotify-light-gray">
          Cargando canciones {Math.min(loaded, pending)}/{pending}. La lista de shows no las trae; cada setlist se pide aparte.
        </p>
      )}
      {failed && (
        <p className="text-sm text-spotify-light-gray">
          setlist.fm cortó algunas canciones. Recargá para completar las que faltan.
        </p>
      )}
      <ConcertDashboard stats={stats} partial={partial} songsLoading={loadingSongs} />
    </div>
  );
}
