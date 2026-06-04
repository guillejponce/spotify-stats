import { NextRequest, NextResponse } from "next/server";
import { deleteRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { trackId: string } }
) {
  try {
    const { trackId } = params;
    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    const result = await deleteRating(trackId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/ratings DELETE]", e);
    return NextResponse.json(
      { error: "Failed to delete rating", detail: String(e) },
      { status: 500 }
    );
  }
}
