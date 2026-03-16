import { NextResponse } from "next/server";

import { computeSessionStatus, markSessionExpired, resolveSession, resolveSettings, resolveTable } from "@/lib/server/public-session";

export async function GET(_: Request, { params }: { params: { sessionToken: string } }): Promise<NextResponse> {
  const session = await resolveSession(params.sessionToken);
  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  const table = await resolveTable(session.tableId);
  const settings = await resolveSettings(session.restaurantId);

  const computed = computeSessionStatus(session);
  if (computed === "expired") {
    await markSessionExpired(session.id);
  }

  return NextResponse.json({
    session: {
      ...session,
      status: computed === "expired" ? "expired" : session.status
    },
    table,
    settings: {
      allowSessionPin: Boolean(settings?.allowSessionPin),
      antiSpamWindowSeconds: settings?.antiSpamWindowSeconds ?? 45,
      maxOrdersPerWindow: settings?.maxOrdersPerWindow ?? 3
    }
  });
}
