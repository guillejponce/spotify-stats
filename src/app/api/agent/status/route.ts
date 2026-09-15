import { NextResponse } from "next/server";
import { isOpenAiConfigured, isSupabaseConfigured } from "@/lib/agent/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    openai: isOpenAiConfigured(),
    supabase: isSupabaseConfigured(),
  });
}
