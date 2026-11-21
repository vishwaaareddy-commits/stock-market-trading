const API_PREFIX = "/api/v1";
const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";

/**
 * Accepts the backend origin ("https://host") or the full API URL ("https://host/api/v1")
 * and always returns the URL ending in /api/v1, without a trailing slash.
 */
export function normalizeApiBase(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  const base = trimmed || DEFAULT_API_ORIGIN;
  return base.endsWith(API_PREFIX) ? base : `${base}${API_PREFIX}`;
}

// NEXT_PUBLIC_* values are inlined at build time: changing it on Vercel requires a redeploy.
export const API_BASE_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

export type HealthResponse = {
  status: string;
  app: string;
  environment: string;
  trading_mode: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "http" | "invalid-response" | "network",
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

export async function fetchHealth(
  signal?: AbortSignal,
  baseUrl: string = API_BASE_URL,
): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/health`, { signal, cache: "no-store" });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError("Backend unreachable (network or CORS error)", "network");
  }
  if (!res.ok) throw new ApiError(`Health check failed (HTTP ${res.status})`, "http", res.status);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("Health endpoint returned invalid JSON", "invalid-response");
  }
  if (typeof body !== "object" || body === null || (body as { status?: unknown }).status !== "ok") {
    throw new ApiError("Health endpoint did not report status ok", "invalid-response");
  }
  return body as HealthResponse;
}
