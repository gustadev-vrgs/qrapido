import { NextResponse } from "next/server";
import { createSessionSchema } from "@/lib/schemas";

export async function POST(request: Request): Promise<NextResponse> {
  const json: unknown = await request.json();
  const parsed = createSessionSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sessionId: crypto.randomUUID() });
}
