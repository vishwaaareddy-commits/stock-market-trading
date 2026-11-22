import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { ADMIN_NAV, NAV_ITEMS, findNavItem, isActive, navFor } from "@/lib/nav";
import { loginErrorMessage, safeNextPath } from "@/lib/auth-helpers";
import { HttpError, api } from "@/lib/client";
import { formatSigned, formatVirtual, isValidAmount, signTone, timeAgo } from "@/lib/money";

const state = vi.hoisted(() => ({
  path: "/",
  replace: vi.fn(),
  push: vi.fn(),
  auth: {} as Record<string, unknown>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useRouter: () => ({ replace: state.replace, push: state.push }),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => state.auth,
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "ok" }), headers: new Headers() }));

const ADMIN = { id: 2, username: "alice", display_name: "Alice", role: "ADMIN", must_change_password: false };
const SUPER = { id: 1, username: "root", display_name: "Root", role: "SUPER_ADMIN", must_change_password: false };

function setAuth(user: Record<string, unknown> | null, status = user ? "authenticated" : "anonymous") {
  state.auth = { user, status, login: vi.fn(), logout: vi.fn(), refresh: vi.fn() };
}

beforeEach(() => {
  state.replace.mockClear();
  state.path = "/";
});

describe("role-separated navigation", () => {
  it("Admin sees only the trading workspace, never Super Admin links", () => {
    setAuth(ADMIN);
    render(<Sidebar />);
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "My Wallet" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Paper Trading" })).toBeInTheDocument();
    for (const item of ADMIN_NAV) expect(nav.queryByRole("link", { name: item.label })).not.toBeInTheDocument();
    expect(nav.queryByRole("group", { name: "Super Admin" })).not.toBeInTheDocument();
  });

  it("Super Admin gets a separate control group plus their own trading group", () => {
    setAuth(SUPER);
    render(<Sidebar />);
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    const control = within(nav.getByRole("group", { name: "Super Admin" }));
    expect(control.getAllByRole("link").map((l) => l.textContent)).toEqual(ADMIN_NAV.map((i) => i.label));
    const trading = within(nav.getByRole("group", { name: "Trading" }));
    expect(trading.getByRole("link", { name: "My Wallet" })).toBeInTheDocument();
    expect(trading.queryByRole("link", { name: "Admins" })).not.toBeInTheDocument();
  });

  it("navFor and route matching behave", () => {
    expect(navFor("ADMIN")).toHaveLength(1);
    expect(navFor("SUPER_ADMIN")).toHaveLength(2);
    expect(navFor(undefined)).toHaveLength(1);
    expect(isActive("/admin/users", "/admin", true)).toBe(false); // /admin root is exact
    expect(isActive("/admin/users/5", "/admin/users")).toBe(true);
    expect(findNavItem("/admin/users/5")?.label).toBe("Admins");
    expect(findNavItem("/admin")?.label).toBe("Control Centre");
    expect(findNavItem("/wallet")?.label).toBe("My Wallet");
    expect(NAV_ITEMS).toHaveLength(7); // original destinations are unchanged
  });
});

describe("route guard (UI convenience; the backend enforces access)", () => {
  it("sends anonymous visitors to /login and renders nothing protected", () => {
    setAuth(null);
    state.path = "/strategies";
    render(<AppShell><p>secret page</p></AppShell>);
    expect(screen.queryByText("secret page")).not.toBeInTheDocument();
    expect(state.replace).toHaveBeenCalledWith("/login?next=%2Fstrategies");
  });

  it("shows a loading state while the session is being checked, without redirecting", () => {
    setAuth(null, "loading");
    render(<AppShell><p>secret page</p></AppShell>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("renders the login page without the app shell", () => {
    setAuth(null);
    state.path = "/login";
    render(<AppShell><p>login form</p></AppShell>);
    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("forces a pending password change and hides navigation", () => {
    setAuth({ ...ADMIN, must_change_password: true });
    state.path = "/wallet";
    render(<AppShell><p>wallet</p></AppShell>);
    expect(state.replace).toHaveBeenCalledWith("/change-password");
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("blocks /admin pages for an Admin but allows a Super Admin", () => {
    setAuth(ADMIN);
    state.path = "/admin/users";
    const { unmount } = render(<AppShell><p>admin list</p></AppShell>);
    expect(screen.queryByText("admin list")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Access restricted");
    unmount();

    setAuth(SUPER);
    render(<AppShell><p>admin list</p></AppShell>);
    expect(screen.getByText("admin list")).toBeInTheDocument();
  });
});

describe("api client", () => {
  afterEach(() => vi.mocked(fetch).mockReset());
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: status < 400, status, json: async () => body, headers: new Headers(headers),
    } as Response);

  it("sends same-origin credentials to /api/v1 and parses JSON", async () => {
    reply(200, { a: 1 });
    await expect(api("/wallet")).resolves.toEqual({ a: 1 });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/wallet");
    expect((init as RequestInit).credentials).toBe("same-origin");
  });

  it("maps string, object and validation errors to readable messages", async () => {
    reply(401, { detail: "Invalid username or password" });
    await expect(api("/x")).rejects.toMatchObject({ status: 401, message: "Invalid username or password" });
    reply(409, { detail: { code: "insufficient_funds", message: "Insufficient virtual funds" } });
    await expect(api("/x")).rejects.toMatchObject({ code: "insufficient_funds", message: "Insufficient virtual funds" });
    reply(422, { detail: [{ loc: ["body", "reason"], msg: "String should have at least 3 characters" }] });
    await expect(api("/x")).rejects.toMatchObject({ message: "reason: String should have at least 3 characters" });
  });

  it("exposes Retry-After for rate limiting and wraps network failures", async () => {
    reply(429, { detail: "Too many failed login attempts." }, { "Retry-After": "600" });
    await expect(api("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({ status: 429, retryAfter: 600 });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("/x")).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("handles 204 responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204, headers: new Headers() } as Response);
    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("login helpers", () => {
  it("only follows same-site relative redirect targets", () => {
    expect(safeNextPath("/wallet")).toBe("/wallet");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "evil", "/login"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });

  it("explains login failures without leaking details", () => {
    expect(loginErrorMessage(new HttpError(401, "x"))).toBe("Invalid username or password.");
    expect(loginErrorMessage(new HttpError(429, "x", undefined, 600))).toContain("10 minutes");
    expect(loginErrorMessage(new HttpError(0, "Cannot reach the server."))).toContain("Cannot reach");
    expect(loginErrorMessage(new Error("boom"))).toBe("Could not sign in. Please try again.");
  });
});

describe("virtual money formatting", () => {
  it("formats decimal strings and never invents values", () => {
    expect(formatVirtual("1250.5000")).toBe("₹1,250.50");
    expect(formatVirtual(null)).toBe("—");
    expect(formatSigned("-50.5")).toBe("−₹50.50");
    expect(formatSigned("12")).toBe("+₹12.00");
    expect(signTone("-1")).toBe("negative");
    expect(signTone("0")).toBe("neutral");
  });

  it("validates amounts", () => {
    expect(isValidAmount("100")).toBe(true);
    expect(isValidAmount("100.25")).toBe(true);
    for (const bad of ["", "0", "-5", "1.234", "abc", "1e5", " "]) expect(isValidAmount(bad)).toBe(false);
  });

  it("reports relative time", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    expect(timeAgo("2026-01-01T00:09:30Z", now)).toBe("30s ago");
    expect(timeAgo("2026-01-01T00:00:00Z", now)).toBe("10m ago");
    expect(timeAgo(null)).toBe("Never");
  });
});

// keep imports used in strict lint configs
void act; void fireEvent; void waitFor;
