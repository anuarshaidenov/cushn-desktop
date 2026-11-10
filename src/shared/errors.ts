/**
 * Domain errors and the IPC result envelope.
 *
 * `ipcRenderer.invoke` rejects with a plain `Error` whose message is prefixed
 * with "Error invoking remote method…" and drops custom properties, and an
 * error thrown across `contextBridge` loses its class. So main never lets an
 * error cross IPC: every handler resolves to an `IpcResult`, and the renderer
 * (`createApiClient` in `api.ts`) turns a failure back into a `CushnError` of
 * its own realm, with `code` and `message` intact.
 */

/**
 * What went wrong, in the caller's terms. The web app used HTTP-like numbers:
 * 400 → BAD_REQUEST, 403 → FORBIDDEN, 404 → NOT_FOUND, 409 → CONFLICT.
 */
export const CUSHN_ERROR_CODES = [
  "BAD_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "NOT_IMPLEMENTED",
  "INTERNAL",
] as const;
export type CushnErrorCode = (typeof CUSHN_ERROR_CODES)[number];

/** The serializable part of a `CushnError`: what crosses IPC. */
export interface CushnErrorData {
  code: CushnErrorCode;
  message: string;
}

/**
 * An expected failure with a user-facing `message` (the web app's messages,
 * verbatim, e.g. "Label not found"). Repositories throw it; the renderer
 * receives it from every `cushn.*` call and every data hook.
 */
export class CushnError extends Error {
  readonly code: CushnErrorCode;

  constructor(code: CushnErrorCode, message: string) {
    super(message);
    this.name = "CushnError";
    this.code = code;
  }

  toData(): CushnErrorData {
    return { code: this.code, message: this.message };
  }
}

export function isCushnError(error: unknown): error is CushnError {
  return error instanceof CushnError;
}

/** The envelope every IPC handler resolves to. Plain data: survives structured clone. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: CushnErrorData };

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function fail(error: CushnErrorData): IpcResult<never> {
  return { ok: false, error: { code: error.code, message: error.message } };
}

/** Returns the data of a successful result; throws a `CushnError` for a failure. */
export function unwrapResult<T>(result: IpcResult<T>): T {
  if (isIpcResult(result)) {
    if (result.ok) return result.data;
    throw new CushnError(result.error.code, result.error.message);
  }
  throw new CushnError("INTERNAL", "Malformed IPC response");
}

function isIpcResult(value: unknown): value is IpcResult<unknown> {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  if (value.ok === true) return "data" in value;
  if (value.ok !== false || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    (CUSHN_ERROR_CODES as readonly unknown[]).includes(error.code) &&
    typeof error.message === "string"
  );
}
