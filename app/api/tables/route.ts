import { NextResponse } from "next/server";
import { createTableSchema } from "@/lib/schemas";

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json();
  const parsed = createTableSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tableId: crypto.randomUUID() }, { status: 201 });
}
