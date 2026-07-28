import { NextResponse } from "next/server";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { configured: false, publicKey: null },
      { status: 200 }
    );
  }
  return NextResponse.json({
    configured: true,
    publicKey: getVapidPublicKey(),
  });
}
