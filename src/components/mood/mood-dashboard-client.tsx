"use client";

import { useState, useEffect } from "react";
import { MoodRobot, MoodRobotSkeleton } from "./mood-robot";
import { MoodTimeline } from "./mood-timeline";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface CurrentMood {
  mood_label: string;
  mood_intensity: number;
  avg_valence: number | null;
  avg_energy: number | null;
  avg_danceability: number | null;
  total_plays: number;
  unique_tracks: number;
  night_share?: number;
  morning_share?: number;
  day_share?: number;
  evening_share?: number;
  message?: string;
}

interface Recommendation {
  track_id: string;
  track_name: string;
  artist_name: string;
  valence: number;
  energy: number;
  mood_match_score: number;
}

export function MoodDashboardClient() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [currentMood, setCurrentMood] = useState<CurrentMood | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingMood, setLoadingMood] = useState(true);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [selectedMoodForRecs, setSelectedMoodForRecs] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCurrentMood() {
      setLoadingMood(true);
      setMoodError(null);
      try {
        const response = await fetch(`/api/mood/current?period=${period}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el mood");
        setCurrentMood(data.mood);
      } catch (err) {
        console.error("Error fetching current mood:", err);
        setCurrentMood(null);
        setMoodError(err instanceof Error ? err.message : "No se pudo cargar el mood");
      } finally {
        setLoadingMood(false);
      }
    }

    fetchCurrentMood();
  }, [period]);

  async function fetchRecommendations(mood: string) {
    setLoadingRecs(true);
    setSelectedMoodForRecs(mood);

    try {
      const response = await fetch(`/api/mood/recommendations?mood=${mood}&limit=20`);
      if (!response.ok) throw new Error("Failed to fetch recommendations");

      const data = await response.json();
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error("Error fetching recommendations:", err);
      setRecommendations([]);
    } finally {
      setLoadingRecs(false);
    }
  }

  const pct = (value: number | null | undefined) => `${Math.round((value ?? 0) * 100)}%`;

  const getMoodDescription = (label: string, stats: CurrentMood) => {
    if (label === "no_data") return stats.message || "No hay reproducciones en este período.";
    const names: Record<string, string> = {
      euphoric: "Eufórico: casi todo fue de tarde",
      energetic: "Energético: mucha escucha de tarde",
      intense: "Intenso: mucha escucha de tarde",
      chill: "Relajado: más escucha de noche o al final del día",
      melancholic: "Melancólico: lo escuchaste sobre todo de noche",
      focused: "Concentrado: lo escuchaste de mañana o durante el día",
      balanced: "Equilibrado: repartido entre varios horarios",
    };
    const name = names[label] || "Mood";
    return `${name}. ${stats.message ?? ""}`.trim();
  };

  const moodButtons = [
    { id: "euphoric", label: "Eufórico", emoji: "🤩" },
    { id: "energetic", label: "Energético", emoji: "⚡" },
    { id: "party", label: "Fiesta", emoji: "🎉" },
    { id: "chill", label: "Relajado", emoji: "😌" },
    { id: "melancholic", label: "Melancólico", emoji: "😔" },
    { id: "focused", label: "Concentrado", emoji: "🎯" },
    { id: "intense", label: "Intenso", emoji: "🔥" },
  ];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Tu Mood Musical</h1>
        <p className="text-gray-400">
          Sale de la hora de Chile en que escuchaste.
        </p>
      </div>

      {/* Mood actual */}
      <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0">
            {loadingMood ? (
              <MoodRobotSkeleton size="xl" />
            ) : currentMood && currentMood.mood_label !== "no_data" ? (
              <MoodRobot
                mood={currentMood.mood_label as any}
                intensity={currentMood.mood_intensity || 0}
                size="xl"
              />
            ) : (
              <MoodRobot mood="no_data" intensity={0} size="xl" />
            )}
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-2xl font-bold">
                Mood de esta {period === "day" ? "día" : period === "week" ? "semana" : "mes"}
              </h2>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="px-3 py-1 bg-gray-800 rounded-lg text-sm border border-gray-700"
              >
                <option value="day">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
              </select>
            </div>

            {moodError && <p className="text-gray-300">{moodError}</p>}

            {currentMood && (
              <p className="text-gray-300 mb-4">
                {getMoodDescription(currentMood.mood_label, currentMood)}
              </p>
            )}

            {currentMood && currentMood.mood_label !== "no_data" && (
              <>
                <p className="text-xs text-gray-500 mb-4">
                  Noche 0–5 · Mañana 6–11 · Día 12–17 · Tarde 18–23. Cuenta escuchas de 30 segundos o más.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-400">Noche</p>
                    <p className="text-xl font-bold text-indigo-300">{pct(currentMood.night_share)}</p>
                  </div>
                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-400">Mañana</p>
                    <p className="text-xl font-bold text-amber-300">{pct(currentMood.morning_share)}</p>
                  </div>
                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-400">Día</p>
                    <p className="text-xl font-bold text-sky-300">{pct(currentMood.day_share)}</p>
                  </div>
                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-400">Tarde</p>
                    <p className="text-xl font-bold text-orange-300">{pct(currentMood.evening_share)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Recomendaciones por mood */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Escuchar según tu mood</h2>
        <p className="text-sm text-gray-400 mb-6">
          Cada mood corresponde a un horario. Acá aparecen las canciones que más escuchaste en ese horario durante los últimos 6 meses.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {moodButtons.map((mood) => (
            <button
              key={mood.id}
              onClick={() => fetchRecommendations(mood.id)}
              disabled={loadingRecs}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${
                  selectedMoodForRecs === mood.id
                    ? "bg-green-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }
                ${loadingRecs ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              <span className="mr-2">{mood.emoji}</span>
              {mood.label}
            </button>
          ))}
        </div>

        {loadingRecs && (
          <div className="text-center py-8 text-gray-400">
            Buscando las canciones perfectas...
          </div>
        )}

        {!loadingRecs && recommendations.length > 0 && (
          <div className="space-y-2">
            {recommendations.slice(0, 10).map((rec, index) => (
              <div
                key={rec.track_id}
                className="p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-6">{index + 1}</span>
                  <div>
                    <p className="font-medium">{rec.track_name}</p>
                    <p className="text-sm text-gray-400">{rec.artist_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {index === 0 ? "La más escuchada" : `${Math.round(rec.mood_match_score * 100)}% del tiempo`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loadingRecs && selectedMoodForRecs && recommendations.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            En los últimos 6 meses no hay escuchas en el horario de ese mood.
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Tu Mood en el Tiempo</h2>
        <p className="text-sm text-gray-400 mb-6">
          Así ha evolucionado tu mood musical
        </p>

        <Tabs defaultValue="week" className="w-full">
          <TabsList>
            <TabsTrigger value="day">Por días</TabsTrigger>
            <TabsTrigger value="week">Por semanas</TabsTrigger>
            <TabsTrigger value="month">Por meses</TabsTrigger>
          </TabsList>

          <TabsContent value="day" className="mt-6">
            <MoodTimeline period="day" limit={14} />
          </TabsContent>

          <TabsContent value="week" className="mt-6">
            <MoodTimeline period="week" limit={12} />
          </TabsContent>

          <TabsContent value="month" className="mt-6">
            <MoodTimeline period="month" limit={12} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
