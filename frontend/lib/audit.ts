export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "SESSION_CREATED",
  "SESSIONS_REVOKED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "USER_DELETED",
  "WALLET_RECHARGE",
  "WALLET_DEDUCTION",
  "ORDER_CREATED",
  "ORDER_CANCELLED",
  "ORDER_REJECTED",
  "ORDER_FILLED",
  "PAGE_VIEW",
] as const;

/** Human-readable one-liner for an audit entry. Details are already free of secrets. */
export function describeAction(action: string, details: Record<string, unknown> | null): string {
  const base = action.toLowerCase().replace(/_/g, " ");
  if (action === "PAGE_VIEW" || !details) return base;
  const reason = typeof details.reason === "string" ? ` — ${details.reason}` : "";
  return `${base}${reason}`;
}
