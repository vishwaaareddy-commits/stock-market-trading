"use client";

import { useCallback, useEffect, useState } from "react";
import { HttpError, api } from "./client";

type Result<T> = { key: string; data?: T; error?: HttpError };

/**
 * GET helper. `loading` is derived (no result for the current key yet), so changing the path
 * never needs a synchronous setState inside an effect. Pass null to skip fetching.
 */
export function useApi<T>(path: string | null) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [version, setVersion] = useState(0);
  const key = path ? `${path}#${version}` : null;

  useEffect(() => {
    if (!path || !key) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: err instanceof HttpError ? err : new HttpError(0, "Request failed") });
      });
    return () => controller.abort();
  }, [path, key]);

  const current = result && result.key === key ? result : null;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return {
    data: current?.data,
    error: current?.error,
    loading: Boolean(path) && current === null,
    reload,
  };
}
