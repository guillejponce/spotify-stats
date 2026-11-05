"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface ActivityEvent {
  activity_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
}

interface FriendActivityFeedProps {
  limit?: number;
  compact?: boolean;
}

export function FriendActivityFeed({ limit = 20, compact = false }: FriendActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchActivities() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/friends/activity?limit=${limit}`);
        if (!response.ok) throw new Error("Failed to fetch friend activity");

        const data = await response.json();
        setActivities(data.activities || []);
      } catch (err) {
        console.error("Error fetching friend activity:", err);
        setError("No se pudo cargar la actividad de amigos");
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();
  }, [limit]);

  const renderActivityContent = (activity: ActivityEvent) => {
    const { event_type, event_data } = activity;

    switch (event_type) {
      case "new_rating":
        return (
          <div className="flex items-start gap-3">
            {event_data.album_image && (
              <img
                src={event_data.album_image}
                alt={event_data.track_name}
                className="w-12 h-12 rounded object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.display_name}</span>
                {" "}calificó{" "}
                <span className="font-medium text-green-400">
                  {event_data.track_name}
                </span>
                {" "}con{" "}
                <span className="text-yellow-400 font-bold">{event_data.rating}/10</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {event_data.artist_name}
              </p>
            </div>
          </div>
        );

      case "discovered_artist":
        return (
          <div className="flex items-start gap-3">
            {event_data.artist_image && (
              <img
                src={event_data.artist_image}
                alt={event_data.artist_name}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.display_name}</span>
                {" "}descubrió a{" "}
                <span className="font-medium text-blue-400">
                  {event_data.artist_name}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                🎉 Nuevo artista
              </p>
            </div>
          </div>
        );

      case "discovered_track":
        return (
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
              🎵
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.display_name}</span>
                {" "}descubrió{" "}
                <span className="font-medium text-purple-400">
                  {event_data.track_name}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {event_data.artist_name}
              </p>
            </div>
          </div>
        );

      case "listening_streak":
        return (
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🔥</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.display_name}</span>
                {" "}lleva{" "}
                <span className="font-bold text-orange-400">
                  {event_data.days} días consecutivos
                </span>
                {" "}escuchando música
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Racha {event_data.milestone}
              </p>
            </div>
          </div>
        );

      case "top_track_changed":
        return (
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
              👑
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.display_name}</span>
                {" "}tiene nueva canción favorita:{" "}
                <span className="font-medium text-yellow-400">
                  {event_data.track_name}
                </span>
              </p>
            </div>
          </div>
        );

      case "big_milestone":
        return (
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🎉</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.display_name}</span>
                {" "}{event_data.message}
              </p>
            </div>
          </div>
        );

      default:
        return (
          <p className="text-sm text-gray-400">
            {activity.display_name} - {event_type}
          </p>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-800 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-800 rounded w-1/2" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-400">{error}</p>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-400 mb-2">No hay actividad reciente de tus amigos</p>
        <p className="text-sm text-gray-500">
          Cuando tus amigos califiquen canciones o descubran artistas, aparecerán aquí
        </p>
      </Card>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {activities.map((activity) => (
        <Card
          key={activity.activity_id}
          className={`${compact ? "p-3" : "p-4"} hover:bg-gray-900/50 transition-colors`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {renderActivityContent(activity)}
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatDistanceToNow(new Date(activity.created_at), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
