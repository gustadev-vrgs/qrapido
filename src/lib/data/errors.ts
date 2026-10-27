export class DataLayerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DataLayerError";
  }
}

export class NotFoundError extends DataLayerError {
  constructor(entity: string, id: string) {
    super(`${entity} not found`, "not_found", { entity, id });
    this.name = "NotFoundError";
  }
}

export function assertOrThrow(condition: boolean, message: string, code = "invalid_argument"): void {
  if (!condition) {
    throw new DataLayerError(message, code);
  }
}

/**
 * Turns Firebase/Firestore failures into a message the operator can act on.
 * The panel used to show "verifique conexão e permissões" for every failure,
 * which hid the real cause (rules not published, missing index, no staff record).
 */
export function describeFirebaseError(error: unknown): string {
  const record = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; message?: unknown; details?: { error?: unknown } };
  const code = String(record.code ?? "");
  const message = [record.message, record.details?.error].filter((part) => typeof part === "string").join(" ");
  if (code === "permission-denied" || /permission|insufficient permissions/i.test(message)) {
    return "O Firestore recusou o acesso. Publique as regras do projeto (npm run firebase:deploy) e confira se seu usuário existe em staffUsers com o restaurantId correto. Veja Configurações → Diagnóstico.";
  }
  if (code === "failed-precondition" || /requires an index/i.test(message)) {
    return "Falta um índice no Firestore para esta consulta. Abra Configurações → Diagnóstico para criar o índice.";
  }
  if (code === "unavailable" || /offline|network|Failed to get document because the client is offline/i.test(message)) {
    return "Sem conexão com o Firebase. Verifique a internet e tente novamente.";
  }
  if (code === "unauthenticated") return "Sua sessão expirou. Faça login novamente.";
  if (/Missing Firebase client environment variables/i.test(message)) {
    return "As variáveis NEXT_PUBLIC_FIREBASE_* não estão configuradas neste deploy.";
  }
  return message ? `Erro do Firebase: ${message.slice(0, 200)}` : "Erro inesperado ao acessar o Firebase.";
}
