/**
 * Same-origin API client. Requests go to /api/v1/* which Next.js proxies to the backend, so the
 * HttpOnly session cookie stays first-party. The session token is never visible to JavaScript.
 */
export const API_PREFIX = "/api/v1";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly retryAfter?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function describe(detail: unknown, fallback: string): { message: string; code?: string } {
  if (typeof detail === "string") return { message: detail };
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    const field = Array.isArray(first?.loc) ? String(first?.loc.at(-1)) : "";
    return { message: first?.msg ? `${field ? `${field}: ` : ""}${first.msg}` : fallback, code: "validation" };
  }
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; code?: string };
    return { message: d.message ?? fallback, code: d.code };
  }
  return { message: fallback };
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method: opts.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
      headers: {
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new HttpError(0, "Cannot reach the server. Check your connection and try again.", "network");
  }
  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail;
    const { message, code } = describe(detail, `Request failed (HTTP ${res.status})`);
    const retry = Number(res.headers.get("Retry-After")) || undefined;
    throw new HttpError(res.status, message, code, retry, payload);
  }
  return payload as T;
}

/** Fresh key per user intent; reuse the SAME key when retrying that intent so it applies once. */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
