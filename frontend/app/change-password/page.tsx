"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Field, PasswordInput } from "@/components/ui/Controls";
import { Notice } from "@/components/ui/Notice";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-helpers";
import { HttpError, api } from "@/lib/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const ready = current && next.length >= MIN_PASSWORD_LENGTH && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
      await refresh();
      router.replace("/");
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <LockKeyhole size={18} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Change password</h1>
          <p className="mt-1 text-sm text-secondary">
            {user?.must_change_password
              ? "You must choose a new password before continuing."
              : "Other devices will be signed out after this change."}
          </p>
        </div>
      </div>
      <Field label="Current password" htmlFor="cp-current">
        <PasswordInput id="cp-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field
        label="New password"
        htmlFor="cp-new"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters, mixing three of: lowercase, uppercase, digits, symbols`}
      >
        <PasswordInput id="cp-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      {tooShort && <p className="text-xs text-warning">Use at least {MIN_PASSWORD_LENGTH} characters.</p>}
      <Field label="Confirm new password" htmlFor="cp-confirm">
        <PasswordInput id="cp-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {mismatch && <p className="text-xs text-negative">Passwords do not match.</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" type="submit" className="flex-1" disabled={!ready || busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
        <Button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </form>
  );
}
