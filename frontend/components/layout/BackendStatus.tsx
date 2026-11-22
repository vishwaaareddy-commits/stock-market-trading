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
    state.kind === "online"
      ? "bg-positive"
      : state.kind === "offline"
        ? "bg-negative"
        : "animate-pulse bg-muted";
  const text =
    state.kind === "online"
      ? "Backend API online"
      : state.kind === "offline"
        ? "Backend API offline"
        : "Checking backend API…";

  return (
    <span
      role="status"
      title={state.kind === "offline" ? state.reason : undefined}
      className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-elevated px-3 text-xs font-medium text-secondary"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {text}
      {state.kind === "offline" && <span className="hidden text-negative lg:inline">({state.reason})</span>}
    </span>
  );
}
