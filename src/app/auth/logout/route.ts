import { NextRequest, NextResponse } from "next/server";
import { createSessionSupabaseClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createSessionSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
