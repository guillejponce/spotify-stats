import { NextResponse } from "next/server";
import { isOpenAiConfigured, isSupabaseConfigured } from "@/lib/agent/env";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  return NextResponse.json({
    openai: isOpenAiConfigured(),
    supabase: isSupabaseConfigured(),
  });
}
