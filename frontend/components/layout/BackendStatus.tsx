"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

type State = "checking" | "online" | "offline";

const STYLES: Record<State, { dot: string; text: string }> = {
  checking: { dot: "bg-zinc-500", text: "Checking API…" },
  online: { dot: "bg-emerald-500", text: "API online" },
  offline: { dot: "bg-red-500", text: "API offline" },
};

export function BackendStatus() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setState("online"))
      .catch(() => {
        if (!controller.signal.aborted) setState("offline");
      });
    return () => controller.abort();
  }, []);

  const { dot, text } = STYLES[state];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}
