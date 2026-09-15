import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
  loading = false,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent",
        className,
      )}
    >
      <CardContent className="p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-spotify-light-gray sm:text-[11px]">
              {title}
            </p>
            {loading ? (
              <>
                <Skeleton className="h-7 w-24 sm:h-8" />
                <Skeleton className="h-3 w-16" />
              </>
            ) : (
              <>
                <p className="truncate text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl">
                  {value}
                </p>
                {subtitle && (
                  <p className="text-[11px] leading-snug text-spotify-light-gray/65 sm:text-xs">
                    {subtitle}
                  </p>
                )}
              </>
            )}
          </div>
          {Icon && (
            <div className="shrink-0 rounded-xl bg-spotify-green/10 p-2">
              <Icon className="h-4 w-4 text-spotify-green sm:h-5 sm:w-5" />
            </div>
          )}
        </div>
        {trend && !loading && (
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
