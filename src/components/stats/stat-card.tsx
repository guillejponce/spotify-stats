import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-spotify-light-gray sm:text-xs">
              {title}
            </p>
            <p className="break-words text-xl font-bold tabular-nums text-white sm:text-2xl">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-spotify-light-gray/60">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className="shrink-0 rounded-lg bg-spotify-green/10 p-2">
              <Icon className="h-5 w-5 text-spotify-green" />
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            <span
              className={cn(
                "text-xs font-medium",
                trend.value >= 0 ? "text-spotify-green" : "text-red-400"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
            <span className="text-xs text-spotify-light-gray/60">
              {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
