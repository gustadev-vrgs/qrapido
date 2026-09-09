import { NextResponse } from "next/server";

// Endpoint legado: tokens de sessão em URLs podem vazar em histórico e logs.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Endpoint descontinuado. Leia novamente o QR fixo da mesa." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
