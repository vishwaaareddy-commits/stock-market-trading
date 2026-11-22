"use client";

import { ArrowLeft, Check, Circle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CredentialDialog } from "@/components/admin/CredentialDialog";
import { Button, Field, Input, PasswordInput } from "@/components/ui/Controls";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { checkPassword } from "@/lib/auth-helpers";
import { HttpError, api } from "@/lib/client";
import type { CredentialResult } from "@/lib/types";

type PasswordMode = "generate" | "custom";

export default function NewAdminPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<PasswordMode>("generate");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [balance, setBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CredentialResult | null>(null);

  const policy = checkPassword(password, username, email);
  const mismatch = confirm.length > 0 && password !== confirm;
  const passwordOk = mode === "generate" || (policy.valid && password === confirm);
  const balanceOk = /^\d{1,16}(\.\d{1,2})?$/.test(balance.trim());
  const ready = username.trim().length >= 3 && email.includes("@") && passwordOk && balanceOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<CredentialResult>("/admin/users", {
        method: "POST",
        body: {
          username: username.trim(),
          email: email.trim(),
          display_name: displayName.trim() || null,
          password: mode === "custom" ? password : null, // null = the server generates a temporary one
          initial_balance: balance.trim(),
        },
      });
      if (res.temporary_password) setCreated(res);
      else router.push(`/admin/users/${res.user.id}`);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Create admin" description="The account is created as an Admin and must change its password at first sign-in.">
        <Link href="/admin/users" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-secondary hover:bg-elevated hover:text-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> Back to admins
        </Link>
      </PageHeader>
      <form onSubmit={submit} noValidate className="max-w-2xl space-y-6">
        <SectionCard title="Account">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" htmlFor="na-username" hint="3–32 characters: a-z, 0-9, . _ -">
              <Input id="na-username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Display name" htmlFor="na-display">
              <Input id="na-display" autoComplete="off" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Email" htmlFor="na-email">
                <Input id="na-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Initial password" description="Either way, the admin must choose their own password at first sign-in.">
          <div role="radiogroup" aria-label="Initial password" className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["generate", "Generate a temporary password", "Shown once after the account is created."],
                ["custom", "Set a custom password", "You choose it and share it securely."],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  mode === value ? "border-accent bg-accent/5" : "border-line hover:border-secondary/50"
                }`}
              >
                <input
                  type="radio"
                  name="password-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{title}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          {mode === "custom" && (
            <div className="mt-5 space-y-4">
              <Field label="Password" htmlFor="na-password">
                <PasswordInput id="na-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label="Confirm password" htmlFor="na-confirm">
                <PasswordInput id="na-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              {mismatch && <p className="text-xs text-negative">Passwords do not match.</p>}
              <ul aria-label="Password requirements" className="space-y-1.5">
                {policy.rules.map((r) => (
                  <li key={r.id} className={`flex items-center gap-2 text-xs ${r.ok ? "text-positive" : "text-muted"}`}>
                    {r.ok ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
                    <span>{r.label}</span>
                    <span className="sr-only">{r.ok ? "(met)" : "(not met)"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Virtual wallet" action={<VirtualBadge />}>
          <Field label="Initial allocation (virtual ₹)" htmlFor="na-balance" hint="Simulated funds only. You can recharge or deduct later.">
            <Input id="na-balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </Field>
          {!balanceOk && <p className="mt-2 text-xs text-negative">Enter 0 or a positive amount with up to 2 decimals.</p>}
        </SectionCard>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={!ready || busy}>
            {busy ? "Creating…" : "Create admin"}
          </Button>
          <Button onClick={() => router.push("/admin/users")}>Cancel</Button>
        </div>
      </form>

      <CredentialDialog
        open={created !== null}
        username={created?.user.username ?? ""}
        password={created?.temporary_password ?? null}
        onClose={() => {
          const id = created?.user.id;
          setCreated(null);
          if (id) router.push(`/admin/users/${id}`);
        }}
      />
    </>
  );
}
