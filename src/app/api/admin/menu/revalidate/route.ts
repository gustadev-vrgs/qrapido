import { NextRequest, NextResponse } from "next/server";

import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { invalidateRestaurantPublicData } from "@/lib/server/public-cache";

/**
 * Called by the panel after it saves the menu or the settings directly in Firestore,
 * so customer phones see the change now instead of when the cache expires.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  invalidateRestaurantPublicData(staff.staffUser.restaurantId);
  return NextResponse.json({ ok: true, requestId: staff.requestId }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiErrors("admin/menu/revalidate", handler, "Não foi possível atualizar o cardápio dos clientes.");

export const dynamic = "force-dynamic";
