import { HttpError } from "./client";

export const MIN_PASSWORD_LENGTH = 12;

/** Only same-site relative paths are honoured, so the login form cannot redirect off-site. */
export function safeNextPath(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/login") ? raw : "/";
}

export function loginErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 429) {
      const mins = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : null;
      return `Too many failed attempts. ${
        mins ? `Try again in about ${mins} minute${mins > 1 ? "s" : ""}.` : "Try again later."
      }`;
    }
    if (err.status === 401) return "Invalid username or password.";
    return err.message;
  }
  return "Could not sign in. Please try again.";
}

export type PasswordRule = { id: string; label: string; ok: boolean };

/**
 * Client-side mirror of the server's password policy, used only to guide the person typing.
 * The server enforces the real rules and has the final say.
 */
export function checkPassword(password: string, username = "", email = ""): { rules: PasswordRule[]; valid: boolean } {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const lowered = password.toLowerCase();
  const forbidden = [username.trim(), email.split("@")[0]?.trim() ?? ""].filter((w) => w.length >= 3);
  const rules: PasswordRule[] = [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: password.length >= MIN_PASSWORD_LENGTH && password.length <= 256 },
    { id: "mix", label: "Three of: lowercase, uppercase, number, symbol", ok: classes >= 3 },
    { id: "personal", label: "Does not contain the username or email name", ok: password.length > 0 && !forbidden.some((w) => lowered.includes(w.toLowerCase())) },
  ];
  return { rules, valid: rules.every((r) => r.ok) };
}
