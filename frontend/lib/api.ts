export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000/api/v1";

export type HealthResponse = {
  status: string;
  app: string;
  environment: string;
  trading_mode: string;
};

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return (await res.json()) as HealthResponse;
}
