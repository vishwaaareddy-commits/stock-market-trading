"use client";

import { ShieldAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingState } from "@/components/ui/LoadingState";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const PUBLIC_PATHS = ["/login"];

function FullScreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6">{children}</div>;
}

/**
 * Client-side routing guard. This is a CONVENIENCE for navigation only: every API endpoint
 * enforces authentication and role permissions on the server regardless of what is shown here.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const pathname = usePathname();
  const router = useRouter();
  const { user, status } = useAuth();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (status === "loading" || isPublic) return;
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user?.must_change_password && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [status, user, pathname, isPublic, router]);

  // Mobile drawer: close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  if (isPublic) return <>{children}</>;

  if (status === "loading") {
    return (
      <FullScreenMessage>
        <div className="w-64">
          <LoadingState label="Checking your session…" />
        </div>
      </FullScreenMessage>
    );
  }
  if (status === "anonymous" || !user) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-muted">Redirecting to sign in…</p>
      </FullScreenMessage>
    );
  }

  // Forced password change: no navigation until it is done.
  if (user.must_change_password) {
    return <main className="mx-auto flex min-h-screen max-w-md items-center px-4">{children}</main>;
  }

  const adminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const forbidden = adminArea && user.role !== "SUPER_ADMIN";

  return (
    <div className="flex min-h-screen">
      <Sidebar open={navOpen} onClose={closeNav} />
      {navOpen && (
        <div
          aria-hidden="true"
          onClick={closeNav}
          className="fixed inset-0 z-30 bg-[var(--overlay)] md:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setNavOpen(true)} menuOpen={navOpen} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div key={pathname} className="page-enter">
          {forbidden ? (
            <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-8 text-center">
              <ShieldAlert size={28} className="mx-auto text-warning" aria-hidden="true" />
              <h1 className="mt-3 text-lg font-semibold text-foreground">Access restricted</h1>
              <p className="mt-1 text-sm text-secondary">This area is only available to Super Admins.</p>
            </div>
          ) : (
            children
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
