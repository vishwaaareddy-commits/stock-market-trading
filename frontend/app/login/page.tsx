"use client";

import { BarChart3, Check, Loader2, Lock, ShieldCheck, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLockup } from "@/components/brand/BrandMark";
import { Button, Field, Input, PasswordInput } from "@/components/ui/Controls";
import { Notice } from "@/components/ui/Notice";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { loginErrorMessage, safeNextPath } from "@/lib/auth-helpers";

type Phase = "idle" | "verifying" | "success";
const SUCCESS_PAUSE_MS = 700; // long enough to read "Signed in", short enough not to feel slow

const HIGHLIGHTS = [
  { icon: Wallet, title: "Virtual wallets", text: "Every account trades with its own simulated balance and an immutable ledger." },
  { icon: BarChart3, title: "Strategy-ready", text: "Built for EMA, RSI, MACD and more, paper-traded on NSE candles." },
  { icon: Lock, title: "Secure by design", text: "Role-based access, hashed passwords and a complete audit trail." },
];

/** Decorative candlestick field for the brand panel. Not data. */
function CandleField() {
  const bars = [34, 52, 40, 66, 48, 78, 58, 92, 70, 104, 84, 118];
  return (
    <svg viewBox="0 0 240 150" className="absolute bottom-16 right-0 h-52 w-auto opacity-50" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {bars.map((h, i) => (
        <g key={i}>
          <rect x={10 + i * 19} y={146 - h} width="9" height={h} rx="3" fill="url(#cf)" />
          <rect x={13.5 + i * 19} y={140 - h - 10} width="2" height="10" rx="1" fill="var(--accent)" opacity="0.5" />
        </g>
      ))}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, status, login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const next = () =>
    safeNextPath(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next"));

  // Already signed in (e.g. opened /login again): go straight on. While a sign-in is in progress this
  // page drives the redirect itself so the success animation can play.
  useEffect(() => {
    if (phase === "idle" && status === "authenticated" && user) {
      router.replace(user.must_change_password ? "/change-password" : next());
    }
  }, [phase, status, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== "idle") return;
    setPhase("verifying");
    setError(null);
    try {
      const u = await login(identifier.trim(), password);
      setPhase("success");
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_PAUSE_MS));
      router.replace(u.must_change_password ? "/change-password" : next());
    } catch (err) {
      setError(loginErrorMessage(err));
      setPassword("");
      setPhase("idle");
    }
  }

  const verifying = phase === "verifying";
  const success = phase === "success";

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-0 h-[30rem] w-[30rem] rounded-full bg-accent-2/20 blur-3xl" />
        <div className="relative">
          <BrandLockup size={42} />
        </div>
        <div className="relative max-w-lg">
          <h2 className="font-display text-[40px] font-semibold leading-[1.1] tracking-tight text-foreground">
            Paper-trade NSE strategies with <span className="text-brand">institutional discipline</span>.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-secondary">
            A simulated trading desk: virtual capital, rule-based strategies and a complete audit trail. No real money, ever.
          </p>
          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-elevated text-accent">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{title}</span>
                  <span className="block text-sm leading-relaxed text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <CandleField />
        <p className="relative flex max-w-sm items-center gap-2 text-xs text-muted">
          <ShieldCheck size={14} aria-hidden="true" className="text-positive" />
          Simulated trading only. Balances are virtual; no real money or broker orders.
        </p>
      </aside>

      {/* Sign-in */}
      <main className="relative flex items-center justify-center px-5 py-12">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[26rem]">
          <div className="mb-8 lg:hidden">
            <BrandLockup size={42} />
          </div>

          <form
            onSubmit={submit}
            noValidate
            aria-busy={verifying}
            className="space-y-5 overflow-hidden rounded-2xl border border-line bg-surface p-7 shadow-card"
          >
            <div>
              <h1 className="font-display text-[28px] font-semibold tracking-tight text-foreground">Sign in</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                Accounts are created by a Super Admin. There is no public sign-up.
              </p>
            </div>

            <fieldset disabled={phase !== "idle"} className="space-y-4">
              <Field label="Username or email" htmlFor="login-identifier">
                <Input
                  id="login-identifier"
                  autoComplete="username"
                  autoFocus
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </Field>
              <Field label="Password" htmlFor="login-password">
                <PasswordInput
                  id="login-password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </fieldset>

            {error && <Notice tone="error">{error}</Notice>}

            <Button
              variant="primary"
              type="submit"
              className={`w-full ${success ? "!bg-positive" : ""}`}
              disabled={phase !== "idle" || !identifier.trim() || !password}
            >
              {verifying && (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Verifying credentials…
                </>
              )}
              {success && (
                <>
                  <Check size={16} aria-hidden="true" />
                  Signed in
                </>
              )}
              {phase === "idle" && "Sign in"}
            </Button>

            {/* Live region so screen readers hear the progress too */}
            <p role="status" aria-live="polite" className="sr-only">
              {verifying ? "Verifying your credentials" : success ? "Signed in, redirecting" : ""}
            </p>
            {(verifying || success) && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-elevated" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    success ? "w-full bg-positive" : "w-2/3 animate-pulse bg-brand"
                  }`}
                />
              </div>
            )}
          </form>

          <p className="mt-5 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted lg:hidden">
            <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-positive" />
            Simulated trading only. Balances are virtual; no real money or broker orders.
          </p>
        </div>
      </main>
    </div>
  );
}
