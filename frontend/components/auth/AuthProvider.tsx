"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HttpError, api } from "@/lib/client";
import type { User } from "@/lib/types";

type Status = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  user: User | null;
  status: Status;
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const HEARTBEAT_INTERVAL_MS = 30_000; // backend marks a user offline after 90s without one

/** Maps a pathname to a whitelisted page name for activity tracking (no content is sent). */
export function pageNameFor(pathname: string): string | null {
  const exact: Record<string, string> = {
    "/": "overview",
    "/strategies": "strategies",
    "/market-data": "market-data",
    "/signals": "signals",
    "/paper-trading": "paper-trading",
    "/backtesting": "backtesting",
    "/settings": "settings",
    "/wallet": "wallet",
    "/admin": "admin-dashboard",
    "/admin/audit": "admin-audit",
  };
  if (exact[pathname]) return exact[pathname];
  if (pathname.startsWith("/admin/users")) return "admin-users";
  if (pathname.startsWith("/admin/wallets")) return "admin-wallets";
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const pathname = usePathname();
  const lastPage = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      setStatus("authenticated");
      return me;
    } catch (err) {
      if (!(err instanceof HttpError) || err.status === 401 || err.status === 0) {
        setUser(null);
        setStatus("anonymous");
      }
      return null;
    }
  }, []);

  // Initial session check. State is set only inside the promise callbacks.
  useEffect(() => {
    let cancelled = false;
    api<User>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api<{ user: User }>("/auth/login", { method: "POST", body: { identifier, password } });
    setUser(res.user);
    setStatus("authenticated");
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* the session may already be gone; clear local state regardless */
    }
    lastPage.current = null;
    setUser(null);
    setStatus("anonymous");
  }, []);

  // Presence: authenticated heartbeat while signed in; stops the moment the tab closes.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const beat = () => {
      api("/auth/heartbeat", { method: "POST" }).catch((err) => {
        if (err instanceof HttpError && err.status === 401) {
          setUser(null);
          setStatus("anonymous");
        }
      });
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  // Activity: which section was opened (whitelisted names only).
  const pending = user?.must_change_password ?? true;
  useEffect(() => {
    if (!userId || pending) return;
    const page = pageNameFor(pathname);
    if (!page || lastPage.current === page) return;
    lastPage.current = page;
    api("/activity/page-view", { method: "POST", body: { page } }).catch(() => undefined);
  }, [userId, pending, pathname]);

  const value = useMemo(() => ({ user, status, login, logout, refresh }), [user, status, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
