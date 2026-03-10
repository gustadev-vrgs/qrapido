import { NextResponse } from "next/server";
import { orderRequestSchema } from "@/lib/schemas";

const dedupeStore = new Set<string>();

export async function POST(request: Request): Promise<NextResponse> {
  const json: unknown = await request.json();
  const parsed = orderRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (dedupeStore.has(parsed.data.dedupeKey)) {
    return NextResponse.json({ error: "duplicate_order" }, { status: 409 });
  }

  dedupeStore.add(parsed.data.dedupeKey);
  return NextResponse.json({ ok: true, orderId: crypto.randomUUID() });
}
