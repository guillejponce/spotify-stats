import { createServerSupabaseClient } from "./supabase";
import type {
  TopItem,
  ListeningTimeData,
  HourlyData,
  TimeFilterParams,
} from "@/types/database";

function buildDateFilter(params: TimeFilterParams): {
  start: string;
  end: string;
} {
  const now = new Date();

  switch (params.filter) {
    case "year": {
      const year = params.year || now.getFullYear();
      return {
        start: `${year}-01-01T00:00:00Z`,
        end: `${year}-12-31T23:59:59Z`,
      };
    }
    case "month": {
      const year = params.year || now.getFullYear();
      const month = params.month || now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      return {
        start: `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`,
        end: `${year}-${String(month).padStart(2, "0")}-${lastDay}T23:59:59Z`,
      };
    }
    case "week": {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      return {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
      };
    }
    case "day": {
      const dayStart = new Date(
        params.startDate || now.toISOString().split("T")[0]
      );
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      return {
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
      };
    }
    default:
      return {
        start: "1970-01-01T00:00:00Z",
        end: new Date().toISOString(),
      };
  }
}

export async function getTotalListeningTime(
  params: TimeFilterParams
): Promise<{ total_ms: number; play_count: number }> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_total_listening_time", {
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  return data || { total_ms: 0, play_count: 0 };
}

export async function getTopTracks(
  params: TimeFilterParams,
  limit: number = 50
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_top_tracks", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return data || [];
}

export async function getTopArtists(
  params: TimeFilterParams,
  limit: number = 50
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_top_artists", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return data || [];
}

export async function getTopAlbums(
  params: TimeFilterParams,
  limit: number = 50
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_top_albums", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return data || [];
}

export async function getListeningOverTime(
  params: TimeFilterParams,
  groupBy: "day" | "week" | "month" = "day"
): Promise<ListeningTimeData[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_listening_over_time", {
    start_date: start,
    end_date: end,
    group_by: groupBy,
  });

  if (error) throw error;
  return data || [];
}

export async function getHourlyDistribution(
  params: TimeFilterParams
): Promise<HourlyData[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_hourly_distribution", {
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  return data || [];
}

export async function getPlatformBreakdown(
  params: TimeFilterParams
): Promise<{ platform: string; play_count: number; ms_played: number }[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilter(params);

  const { data, error } = await supabase.rpc("get_platform_breakdown", {
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  return data || [];
}

export async function getHeatmapData(
  year: number
): Promise<{ date: string; count: number; ms_played: number }[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_heatmap_data", {
    target_year: year,
  });

  if (error) throw error;
  return data || [];
}
