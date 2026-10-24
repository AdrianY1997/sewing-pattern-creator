/** Errors of operations that cannot be applied (replay turns them into issues). */

/** Raised by an operation that cannot be applied; becomes a ReplayIssue. */
export class OpError extends Error {}

export const fail = (message: string): never => {
  throw new OpError(message)
}

export const errorMessage = (e: unknown): string =>
  e instanceof OpError ? e.message : `Error al aplicar: ${(e as Error)?.message ?? String(e)}`
