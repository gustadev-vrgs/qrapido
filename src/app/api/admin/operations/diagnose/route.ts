import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError, withApiErrors } from "@/lib/server/api-errors";
import { isValidPublicTableToken } from "@/lib/utils/public-url";

type Db = any;
type DiagnosticIssue = { code: string; severity: "error" | "warning"; message: string; fix: string; link?: string; tableId?: string };

function indexLink(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : "";
  return message.match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0];
}

/** Read-only: inspects the restaurant data and the queries that need composite indexes. Never changes anything. */
async function diagnose(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  const issues: DiagnosticIssue[] = [];

  const [restaurant, settings, tables, sessions, categories, items] = await Promise.all([
    db.collection("restaurants").doc(restaurantId).get(),
    db.collection("restaurantSettings").where("restaurantId", "==", restaurantId).limit(1).get(),
    db.collection("tables").where("restaurantId", "==", restaurantId).get(),
    db.collection("tableSessions").where("restaurantId", "==", restaurantId).where("status", "==", "active").get(),
    db.collection("menuCategories").where("restaurantId", "==", restaurantId).get(),
    db.collection("menuItems").where("restaurantId", "==", restaurantId).get()
  ]);

  if (!restaurant.exists) issues.push({ code: "RESTAURANT_DOC_MISSING", severity: "error", message: `Não existe o documento restaurants/${restaurantId}. O nome do restaurante não aparece e as configurações não podem ser salvas.`, fix: "Clique em \"Corrigir automaticamente\"." });
  if (settings.empty) issues.push({ code: "SETTINGS_MISSING", severity: "warning", message: "O restaurante ainda não tem configurações salvas (formas de pagamento, taxa de serviço, tempo de atendimento). Valores padrão estão sendo usados.", fix: "Clique em \"Corrigir automaticamente\" ou salve a página de Configurações." });

  const activeCategoryIds = new Set(categories.docs.filter((doc: Db) => doc.data().isActive !== false).map((doc: Db) => doc.id));
  const sellable = items.docs.filter((doc: Db) => doc.data().isActive !== false && doc.data().isAvailable !== false && activeCategoryIds.has(doc.data().categoryId));
  if (!sellable.length) issues.push({ code: "MENU_EMPTY", severity: "warning", message: "Nenhum produto ativo em categoria ativa: o cliente verá o cardápio vazio.", fix: "Cadastre ao menos uma categoria ativa e um produto disponível em Cardápio." });
  if (!tables.size) issues.push({ code: "NO_TABLES", severity: "warning", message: "Nenhuma mesa cadastrada.", fix: "Crie uma mesa em Mesas → Nova mesa." });

  const liveSessions = new Map<string, Db>(sessions.docs.map((doc: Db) => [doc.id, doc.data()]));
  for (const doc of tables.docs) {
    const table = doc.data();
    if (table.archivedAt) continue;
    const name = table.label || `Mesa ${table.number}`;
    if (!isValidPublicTableToken(table.publicToken)) issues.push({ code: "TABLE_QR_INVALID", severity: "error", tableId: doc.id, message: `${name}: o QR Code desta mesa não tem um identificador válido, por isso a leitura dá "mesa não encontrada".`, fix: "Clique em \"Corrigir automaticamente\" e imprima o QR novamente." });
    if (table.status === "active" && !liveSessions.has(table.currentSessionGroupId)) issues.push({ code: "TABLE_ACTIVE_WITHOUT_SESSION", severity: "warning", tableId: doc.id, message: `${name} aparece ocupada, mas não tem atendimento válido.`, fix: "Em Mesas, use \"Encerrar mesa\" para liberá-la." });
    if (table.status === "blocked" && table.isActive !== false) issues.push({ code: "TABLE_LEGACY_BLOCKED", severity: "warning", tableId: doc.id, message: `${name} ficou bloqueada por uma versão antiga do sistema (atendimento expirado).`, fix: "Em Mesas, use \"Encerrar mesa\" ou \"Renovar\"." });
  }

  // Queries used by Relatórios still rely on composite indexes; probe each with limit(1).
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const probes: Array<[string, () => Promise<unknown>]> = [
    ["Relatórios: pedidos por período", () => db.collection("orders").where("restaurantId", "==", restaurantId).where("receivedAt", ">=", since).orderBy("receivedAt", "desc").limit(1).get()],
    ["Relatórios: atendimentos por período", () => db.collection("tableSessions").where("restaurantId", "==", restaurantId).where("startedAt", ">=", since).orderBy("startedAt", "desc").limit(1).get()],
    ["Relatórios: eventos por período", () => db.collection("orderEvents").where("restaurantId", "==", restaurantId).where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(1).get()]
  ];
  for (const [label, probe] of probes) {
    try { await probe(); } catch (error) {
      const failure = classifyServerError(error);
      if (failure.code === "firestore_index_missing") issues.push({ code: "INDEX_MISSING", severity: "warning", message: `${label}: falta um índice no Firestore (somente Relatórios é afetado).`, fix: "Abra o link para criar o índice, ou publique os índices com \"npm run firebase:deploy\".", link: indexLink(error) });
      else throw error;
    }
  }

  return NextResponse.json({ generatedAt: new Date().toISOString(), restaurantId, staffRole: staff.staffUser.role, issueCount: issues.length, issues }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiErrors("admin/operations/diagnose", diagnose, "Não foi possível executar o diagnóstico.");

export const dynamic = "force-dynamic";
