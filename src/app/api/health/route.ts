import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminConfigStatus, getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { classifyServerError } from "@/lib/server/api-errors";
import { describePublicUrlProblem, getPublicAppBaseUrl } from "@/lib/utils/public-url";

export const dynamic = "force-dynamic";

/**
 * Public, read-only health check used by Configurações → Diagnóstico.
 * Reports whether the server can reach Firestore and which setting is wrong,
 * without ever returning credential values.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = getFirebaseAdminConfigStatus();
  let firestore: { ok: boolean; code?: string; hint?: string } = { ok: false, code: "skipped", hint: "Credenciais do servidor ausentes." };
  if (admin.ok || admin.projectId) {
    try {
      const db = getFirebaseAdminFirestore() as { collection: (name: string) => { limit: (n: number) => { get: () => Promise<unknown> } } };
      await db.collection("restaurants").limit(1).get();
      firestore = { ok: true };
    } catch (error) {
      const failure = classifyServerError(error);
      firestore = { ok: false, code: failure.code, hint: failure.hint };
    }
  }
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || null;
  const publicBaseUrl = getPublicAppBaseUrl(request.nextUrl.origin);
  return NextResponse.json({
    status: admin.ok && firestore.ok ? "ok" : "degraded",
    project: "qrapido",
    checkedAt: new Date().toISOString(),
    firebaseClient: { projectId: clientProjectId, ok: Boolean(clientProjectId) },
    firebaseAdmin: { ok: admin.ok, source: admin.source, projectId: admin.projectId, problems: admin.problems },
    firestore,
    publicUrl: { base: publicBaseUrl, problem: describePublicUrlProblem(request.nextUrl.origin) }
  }, { headers: { "Cache-Control": "no-store" } });
}
