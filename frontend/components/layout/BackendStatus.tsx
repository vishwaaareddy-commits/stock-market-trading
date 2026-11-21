"use client";

import { useEffect, useState } from "react";
import { ApiError, fetchHealth } from "@/lib/api";

type State =
  | { kind: "checking" }
  | { kind: "online" }
  | { kind: "offline"; reason: string };

/** Reports connectivity to OUR FastAPI backend only. Market-data provider status is separate. */
export function BackendStatus() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setState({ kind: "online" }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "offline",
          reason: err instanceof ApiError ? err.message : "Unknown error",
        });
      });
    return () => controller.abort();
  }, []);

  const dot =
    state.kind === "online" ? "bg-emerald-500" : state.kind === "offline" ? "bg-red-500" : "bg-zinc-500";
  const text =
    state.kind === "online" ? "Backend API online" : state.kind === "offline" ? "Backend API offline" : "Checking backend API…";

  return (
    <span
      role="status"
      title={state.kind === "offline" ? state.reason : undefined}
      className="inline-flex items-center gap-2 text-xs text-muted"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {text}
      {state.kind === "offline" && <span className="text-red-400/80">({state.reason})</span>}
    </span>
  );
}
