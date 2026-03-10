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
