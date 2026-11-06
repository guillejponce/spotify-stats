"use client";

import { useState, useEffect } from "react";
import { MoodRobot, MoodRobotSkeleton } from "./mood-robot";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MoodDataPoint {
  period_start: string;
  period_end: string;
  avg_valence: number | null;
  avg_energy: number | null;
  mood_label: string;
  mood_intensity: number | null;
  total_plays: number;
}

interface MoodTimelineProps {
  period?: "day" | "week" | "month" | "year";
  limit?: number;
}

export function MoodTimeline({ period = "week", limit = 12 }: MoodTimelineProps) {
  const [timeline, setTimeline] = useState<MoodDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTimeline() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          period,
          limit: limit.toString(),
        });

        const response = await fetch(`/api/mood/timeline?${params}`);
        if (!response.ok) throw new Error("Failed to fetch mood timeline");

        const data = await response.json();
        setTimeline(data.timeline || []);
      } catch (err) {
        console.error("Error fetching mood timeline:", err);
        setError("No se pudo cargar el timeline");
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, [period, limit]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 bg-gray-900/50 rounded-lg">
              <MoodRobotSkeleton size="sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>{error}</p>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>No hay suficientes géneros en este período para armar el timeline.</p>
        <p className="text-sm mt-2">
          El mood se estima con los géneros de los artistas que escuchaste.
        </p>
      </div>
    );
  }

  const formatPeriodLabel = (start: string, periodType: string) => {
    const date = new Date(start);
    switch (periodType) {
      case "day":
        return format(date, "d MMM", { locale: es });
      case "week":
        return format(date, "d MMM", { locale: es });
      case "month":
        return format(date, "MMM yyyy", { locale: es });
      case "year":
        return format(date, "yyyy");
      default:
        return format(date, "d MMM", { locale: es });
    }
  };

  return (
    <div className="space-y-6">
      {/* Grid de moods */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {timeline.map((point, index) => (
          <div
            key={index}
            className="p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors"
          >
            <div className="mb-2">
              <MoodRobot
                mood={point.mood_label as any}
                intensity={point.mood_intensity || 0}
                size="sm"
                showLabel={false}
              />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">
                {formatPeriodLabel(point.period_start, period)}
              </p>
              <p className="text-xs text-gray-500">
                {point.total_plays} plays
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Mood Chart - visualización simplificada */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4">
          Valence vs Energy
        </h3>
        <div className="h-64 bg-gray-900/30 rounded-lg p-4 relative overflow-hidden">
          {/* Cuadrantes */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
            <div className="bg-orange-500/5 flex items-center justify-center text-xs text-gray-600">
              Energético
            </div>
            <div className="bg-pink-500/5 flex items-center justify-center text-xs text-gray-600">
              Eufórico
            </div>
            <div className="bg-indigo-500/5 flex items-center justify-center text-xs text-gray-600">
              Melancólico
            </div>
            <div className="bg-blue-500/5 flex items-center justify-center text-xs text-gray-600">
              Chill
            </div>
          </div>

          {/* Puntos del timeline */}
          <div className="absolute inset-4">
            {timeline.map((point, index) => {
              if (!point.avg_valence || !point.avg_energy) return null;

              const x = point.avg_valence * 100;
              const y = (1 - point.avg_energy) * 100;

              return (
                <div
                  key={index}
                  className="absolute w-3 h-3 bg-green-500 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  title={formatPeriodLabel(point.period_start, period)}
                />
              );
            })}
          </div>

          {/* Labels de ejes */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-gray-600">
            Valence →
          </div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-gray-600">
            Energy →
          </div>
        </div>
      </div>
    </div>
  );
}
