"use client";

import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/** Account menu: who is signed in, change password, sign out. Closes on Escape and outside click. */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = user.display_name ?? user.username;
  const role = user.role === "SUPER_ADMIN" ? "Super Admin" : "Admin";

  async function signOut() {
    setOpen(false);
    await logout();
    router.replace("/login");
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-elevated pl-1.5 pr-2.5 transition-colors hover:border-accent/50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[9rem] truncate text-[13px] font-medium text-foreground">{name}</span>
          <span className="block text-[10px] uppercase tracking-wider text-muted">{role}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="sr-only">Account menu for {name}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-1.5 inline-flex rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              {role}
            </p>
          </div>
          <div className="p-1.5">
            <Link
              role="menuitem"
              href="/change-password"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-secondary transition-colors hover:bg-elevated hover:text-foreground"
            >
              <KeyRound size={15} aria-hidden="true" /> Change password
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-secondary transition-colors hover:bg-negative/10 hover:text-negative"
            >
              <LogOut size={15} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
