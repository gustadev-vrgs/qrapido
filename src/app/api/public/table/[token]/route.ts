import { NextRequest, NextResponse } from "next/server";

import { withApiErrors } from "@/lib/server/api-errors";
import { loadRestaurantPublicData } from "@/lib/server/public-cache";
import { computeSessionStatus, findLiveSessionForTable, markSessionExpired, PUBLIC_ACCESS_COOKIE, resolveTableByPublicToken, validateAccessGrant } from "@/lib/server/public-session";
import type { PublicTableAccess } from "@/lib/types/domain";
import { isValidPublicTableToken } from "@/lib/utils/public-url";

async function handler(request: NextRequest, context: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const params = await context.params;
  const token = decodeURIComponent(params.token ?? "").trim();
  if (!isValidPublicTableToken(token)) return NextResponse.json({ error: "QR Code inválido ou mesa não encontrada.", code: "invalid_qr" }, { status: 404 });

  const table = await resolveTableByPublicToken(token);
  if (!table) return NextResponse.json({ error: "QR Code inválido ou mesa não encontrada. Peça à equipe o QR Code atualizado desta mesa.", code: "invalid_qr" }, { status: 404 });
  if (table.isActive === false) return NextResponse.json({ error: "Esta mesa está temporariamente indisponível. Chame um atendente.", code: "table_disabled" }, { status: 423 });

  // Menu, settings and name come from a short-lived cache: phones poll this route.
  const [session, publicData] = await Promise.all([findLiveSessionForTable(table), loadRestaurantPublicData(table.restaurantId)]);
  const settings = publicData.settings;

  let access: PublicTableAccess = "no_session";
  if (session) {
    const status = computeSessionStatus(session);
    if (status === "expired") {
      await markSessionExpired(session.id);
      access = "expired";
    } else if (status === "active" && table.status === "active") {
      access = (await validateAccessGrant(session, request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null)) ? "authorized" : "needs_code";
    }
  }

  const authorized = access === "authorized" && session;
  const response = NextResponse.json({
    restaurantName: publicData.restaurantName,
    table: { number: table.number, label: table.label ?? `Mesa ${table.number}` },
    access,
    session: authorized ? {
      id: session.id,
      tableNumber: session.tableNumber,
      peopleCount: session.peopleCount,
      orderLimitEnabled: session.orderLimitEnabled === true,
      maxOrdersAllowed: session.maxOrdersAllowed ?? 0,
      completedOrdersCount: session.completedOrdersCount ?? 0,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt
    } : null,
    categories: publicData.categories,
    items: publicData.items,
    settings: {
      acceptedPaymentMethods: Array.isArray(settings?.acceptedPaymentMethods) && settings.acceptedPaymentMethods.length ? settings.acceptedPaymentMethods : ["pix", "cash", "debit_card", "credit_card"],
      allowCustomerNotes: settings?.allowCustomerNotes ?? true,
      allowWaiterCall: settings ? (settings.waiterCallEnabled ?? settings.allowWaiterCall ?? true) !== false : true,
      billRequestEnabled: settings?.billRequestEnabled ?? true,
      requireCustomerName: settings?.requireCustomerName ?? false,
      serviceFeePercent: Number(settings?.serviceFeePercent ?? 0),
      pixKey: authorized ? settings?.pixKey ?? null : null,
      pixReceiverName: authorized ? settings?.pixReceiverName ?? null : null
    }
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = withApiErrors("public/table", handler, "Não foi possível carregar esta mesa agora. Avise a equipe do restaurante.");

export const dynamic = "force-dynamic";
