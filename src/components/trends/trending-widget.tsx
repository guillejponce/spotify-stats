"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

interface TrendingArtist {
  artist_id: string;
  artist_name: string;
  artist_image: string | null;
  current_period_plays: number;
  previous_period_plays: number;
  growth_rate: number;
  prediction: string;
}

interface TrendingTrack {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_image: string | null;
  current_period_plays: number;
  previous_period_plays: number;
  growth_rate: number;
  prediction: string;
}

interface TrendsDashboard {
  trending_artists: TrendingArtist[];
  trending_tracks: TrendingTrack[];
  discovery_rate: {
    new_artists_count: number;
    new_tracks_count: number;
  };
}

export function TrendingWidget() {
  const [trends, setTrends] = useState<TrendsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrends() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/trends/dashboard");
        if (!response.ok) throw new Error("Failed to fetch trends");

        const data = await response.json();
        setTrends(data);
      } catch (err) {
        console.error("Error fetching trends:", err);
        setError("No se pudieron cargar las tendencias");
      } finally {
        setLoading(false);
      }
    }

    fetchTrends();
  }, []);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-800 rounded w-1/3" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-800 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-800 rounded w-2/3" />
                  <div className="h-3 bg-gray-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error || !trends) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-400">{error || "No hay datos disponibles"}</p>
      </Card>
    );
  }

  const hasArtists = trends.trending_artists && trends.trending_artists.length > 0;
  const hasTracks = trends.trending_tracks && trends.trending_tracks.length > 0;

  if (!hasArtists && !hasTracks) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
          📈 Next Big Thing
        </h3>
        <p className="text-sm text-gray-400">
          No hay suficientes datos para detectar tendencias. ¡Sigue escuchando música!
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span className="text-2xl">🔮</span>
          Next Big Thing
        </h3>
        {trends.discovery_rate && (
          <div className="text-xs text-gray-500">
            +{trends.discovery_rate.new_artists_count} artistas este mes
          </div>
        )}
      </div>

      {/* Trending Artists */}
      {hasArtists && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-400 mb-3">
            🚀 Artistas en ascenso
          </h4>
          <div className="space-y-3">
            {trends.trending_artists.map((artist, index) => (
              <div
                key={artist.artist_id}
                className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
              >
                <div className="flex-shrink-0">
                  {artist.artist_image ? (
                    <img
                      src={artist.artist_image}
                      alt={artist.artist_name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                      <span className="text-xl">🎤</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{artist.artist_name}</p>
                  <p className="text-xs text-gray-400">{artist.prediction}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-green-400">
                    +{Math.round(artist.growth_rate)}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {artist.current_period_plays} plays
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trending Tracks */}
      {hasTracks && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-3">
            🎵 Canciones en ascenso
          </h4>
          <div className="space-y-3">
            {trends.trending_tracks.map((track, index) => (
              <div
                key={track.track_id}
                className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
              >
                <div className="flex-shrink-0">
                  {track.album_image ? (
                    <img
                      src={track.album_image}
                      alt={track.track_name}
                      className="w-12 h-12 rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                      <span className="text-xl">🎵</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{track.track_name}</p>
                  <p className="text-xs text-gray-400">{track.artist_name}</p>
                  <p className="text-xs text-gray-500 mt-1">{track.prediction}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-green-400">
                    +{Math.round(track.growth_rate)}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {track.current_period_plays} plays
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
