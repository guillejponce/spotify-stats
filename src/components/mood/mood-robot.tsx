"use client";

import { useMemo } from "react";

type MoodLabel =
  | "euphoric"
  | "energetic"
  | "intense"
  | "chill"
  | "melancholic"
  | "focused"
  | "balanced"
  | "no_data"
  | "unknown";

interface MoodRobotProps {
  mood: MoodLabel;
  intensity?: number; // 0-1
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
}

const MOOD_CONFIG: Record<
  MoodLabel,
  {
    emoji: string;
    color: string;
    bgColor: string;
    description: string;
    animation: string;
  }
> = {
  euphoric: {
    emoji: "🤩",
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
    description: "¡Eufórico!",
    animation: "animate-bounce",
  },
  energetic: {
    emoji: "⚡",
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    description: "Energético",
    animation: "animate-pulse",
  },
  intense: {
    emoji: "🔥",
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    description: "Intenso",
    animation: "animate-pulse",
  },
  chill: {
    emoji: "😌",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    description: "Relajado",
    animation: "",
  },
  melancholic: {
    emoji: "😔",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/20",
    description: "Melancólico",
    animation: "",
  },
  focused: {
    emoji: "🎯",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    description: "Concentrado",
    animation: "",
  },
  balanced: {
    emoji: "😊",
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    description: "Equilibrado",
    animation: "",
  },
  no_data: {
    emoji: "💤",
    color: "text-gray-400",
    bgColor: "bg-gray-500/20",
    description: "Sin datos",
    animation: "",
  },
  unknown: {
    emoji: "🤔",
    color: "text-gray-400",
    bgColor: "bg-gray-500/20",
    description: "Desconocido",
    animation: "",
  },
};

const SIZE_CONFIG = {
  sm: {
    container: "w-12 h-12",
    emoji: "text-2xl",
    label: "text-xs",
  },
  md: {
    container: "w-16 h-16",
    emoji: "text-3xl",
    label: "text-sm",
  },
  lg: {
    container: "w-24 h-24",
    emoji: "text-5xl",
    label: "text-base",
  },
  xl: {
    container: "w-32 h-32",
    emoji: "text-7xl",
    label: "text-lg",
  },
};

export function MoodRobot({
  mood,
  intensity = 0.5,
  size = "md",
  showLabel = true,
}: MoodRobotProps) {
  const config = MOOD_CONFIG[mood] || MOOD_CONFIG.unknown;
  const sizeConfig = SIZE_CONFIG[size];

  // Calcular escala basada en intensidad
  const scale = useMemo(() => {
    return 0.85 + intensity * 0.3; // 0.85 - 1.15
  }, [intensity]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`
          ${sizeConfig.container}
          ${config.bgColor}
          ${config.animation}
          rounded-full
          flex items-center justify-center
          border-2 border-current
          ${config.color}
          transition-all duration-300
          hover:scale-110
        `}
        style={{
          transform: `scale(${scale})`,
        }}
      >
        <span className={sizeConfig.emoji} role="img" aria-label={mood}>
          {config.emoji}
        </span>
      </div>

      {showLabel && (
        <div className="text-center">
          <p className={`${sizeConfig.label} font-medium ${config.color}`}>
            {config.description}
          </p>
          {intensity > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Intensidad: {Math.round(intensity * 100)}%
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MoodRobotSkeleton({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`
          ${sizeConfig.container}
          bg-gray-800/50
          rounded-full
          animate-pulse
        `}
      />
      <div className="h-4 w-20 bg-gray-800/50 rounded animate-pulse" />
    </div>
  );
}
