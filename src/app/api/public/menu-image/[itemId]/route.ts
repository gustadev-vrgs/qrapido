import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export const dynamic = "force-dynamic";

/** Serves a dish photo. The URL carries a version (?v=), so browsers and the CDN may cache it for a long time. */
export async function GET(_request: NextRequest, { params }: { params: { itemId: string } }): Promise<NextResponse> {
  const id = String(params.itemId ?? "").slice(0, 128);
  if (!id) return new NextResponse(null, { status: 404 });
  try {
    const snap = await (getAdminFirestore() as any).collection("menuImages").doc(id).get();
    if (!snap.exists) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const image = snap.data();
    const body = Buffer.from(String(image.data ?? ""), "base64");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": String(image.contentType ?? "image/jpeg"),
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
