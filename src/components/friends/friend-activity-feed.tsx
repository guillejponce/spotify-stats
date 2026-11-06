"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/friends/user-avatar";

interface ActivityEvent {
  activity_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  event_type: string;
  event_data: Record<string, string | number | null | undefined>;
  created_at: string;
}

function text(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

function ActivityCopy({ activity }: { activity: ActivityEvent }) {
  const data = activity.event_data;
  const name = activity.display_name ?? "Alguien";

  switch (activity.event_type) {
    case "new_rating":
      return (
        <p className="text-sm leading-snug text-white">
          <span className="font-medium">{name}</span> calificó{" "}
          <span className="font-medium">{text(data.track_name)}</span>
          {data.artist_name ? <span className="text-spotify-light-gray"> · {text(data.artist_name)}</span> : null}
          <span className="ml-1.5 font-semibold text-spotify-green">{text(data.rating)}/10</span>
        </p>
      );
    case "discovered_artist":
      return (
        <p className="text-sm leading-snug text-white">
          <span className="font-medium">{name}</span> descubrió a{" "}
          <span className="font-medium">{text(data.artist_name)}</span>
        </p>
      );
    case "discovered_track":
      return (
        <p className="text-sm leading-snug text-white">
          <span className="font-medium">{name}</span> escuchó por primera vez{" "}
          <span className="font-medium">{text(data.track_name)}</span>
          {data.artist_name ? <span className="text-spotify-light-gray"> · {text(data.artist_name)}</span> : null}
        </p>
      );
    case "listening_streak":
      return (
        <p className="text-sm leading-snug text-white">
          <span className="font-medium">{name}</span> lleva{" "}
          <span className="font-medium">{text(data.days)} días seguidos</span> escuchando
        </p>
      );
    case "top_track_changed":
      return (
        <p className="text-sm leading-snug text-white">
          <span className="font-medium">{name}</span> cambió su canción favorita a{" "}
          <span className="font-medium">{text(data.track_name)}</span>
        </p>
      );
    case "big_milestone":
      return (
        <p className="text-sm leading-snug text-white">
          <span className="font-medium">{name}</span> {text(data.message)}
        </p>
      );
    default:
      return (
        <p className="text-sm text-spotify-light-gray">
          {name} tuvo actividad nueva
        </p>
      );
  }
}

function ActivityThumb({ activity }: { activity: ActivityEvent }) {
  const image = text(activity.event_data.album_image || activity.event_data.artist_image);
  if (!image) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
  );
}

export function FriendActivityFeed({ limit = 30 }: { limit?: number }) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/friends/activity?limit=${limit}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar la actividad");
        if (!cancelled) setActivities(data.activities || []);
      } catch (err) {
        if (!cancelled) {
          setActivities([]);
          setError(err instanceof Error ? err.message : "No se pudo cargar la actividad");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg bg-white/5 p-3">
              <div className="h-10 w-10 rounded-full bg-white/10" />
              <div className="h-4 flex-1 rounded bg-white/10" />
            </div>
          ))}

        {!loading && error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && !error && activities.length === 0 && (
          <p className="text-sm text-spotify-light-gray">
            Cuando un amigo califique una canción con 8 o más, va a aparecer acá.
          </p>
        )}

        {!loading &&
          activities.map((activity) => (
            <div key={activity.activity_id} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
              <Link href={`/u/${activity.user_id}`} className="shrink-0 hover:opacity-90">
                <UserAvatar url={activity.avatar_url} name={activity.display_name} />
              </Link>
              <div className="min-w-0 flex-1">
                <ActivityCopy activity={activity} />
                <p className="mt-1 text-xs text-spotify-light-gray">
                  {formatDistanceToNow(new Date(activity.created_at), {
                    addSuffix: true,
                    locale: es,
                  })}
                </p>
              </div>
              <ActivityThumb activity={activity} />
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
