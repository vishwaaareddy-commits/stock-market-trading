import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { BrandLockup } from "@/components/brand/BrandMark";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineChart } from "@/components/ui/LineChart";
import { MetricCard } from "@/components/ui/MetricCard";
import { formatCompact } from "@/lib/money";
import { cashSeries } from "@/lib/series";
import type { WalletTx } from "@/lib/types";

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  logout: vi.fn(),
  user: { id: 1, username: "boss", display_name: "Super Admin", email: "boss@example.com", role: "SUPER_ADMIN" },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: state.user, status: "authenticated", logout: state.logout, login: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  state.replace.mockClear();
  state.logout.mockReset();
});

describe("design tokens (the spec'd palette must not drift)", () => {
  const css = readFileSync(path.resolve("app/globals.css"), "utf8").toLowerCase();
  const dark = css.slice(css.indexOf(":root,"), css.indexOf(':root[data-theme="light"]'));
  const light = css.slice(css.indexOf(':root[data-theme="light"]'), css.indexOf("@theme inline"));

  it("dark theme uses the specified colours", () => {
    for (const hex of ["#101126", "#12142d", "#191a38", "#202344", "#00d9e8", "#7557ff", "#17d6a0", "#ff5478", "#f4f5ff", "#a4a8c4"]) {
      expect(dark, hex).toContain(hex);
    }
  });

  it("light theme is its own palette (not an inversion) with deeper accents for text contrast", () => {
    expect(light).toContain("color-scheme: light");
    expect(light).toContain("--accent: #08758f"); // dark enough for AA text on white
    expect(light).toContain("--surface: #ffffff");
    expect(light).not.toContain("--accent: #00d9e8"); // neon cyan is for dark surfaces only
    const tokens = (block: string) => [...block.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]);
    for (const t of ["background", "sidebar", "surface", "elevated", "accent", "accent-2", "positive", "negative", "foreground", "secondary", "line", "chart-grid"]) {
      expect(tokens(light), t).toContain(t);
    }
  });
});

describe("brand", () => {
  it("renders the product lockup", () => {
    render(<BrandLockup />);
    expect(screen.getByText("Trading System")).toBeInTheDocument();
    expect(screen.getByText("NSE · Paper Trading")).toBeInTheDocument();
  });
});

describe("ProfileMenu", () => {
  it("shows who is signed in, links to change password, and signs out", async () => {
    state.logout.mockResolvedValue(undefined);
    render(<ProfileMenu />);
    const trigger = screen.getByRole("button", { name: /account menu for super admin/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText("boss@example.com")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /change password/i })).toHaveAttribute("href", "/change-password");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /sign out/i }));
    await vi.waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
    expect(state.logout).toHaveBeenCalled();
  });

  it("closes on Escape and on outside click", () => {
    render(<ProfileMenu />);
    const trigger = screen.getByRole("button", { name: /account menu/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("DataTable pagination", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), name: i % 2 ? `Beta ${i + 1}` : `Alpha ${i + 1}` }));
  const columns = [{ header: "Name", render: (r: (typeof rows)[number]) => r.name }];
  const table = () => (
    <DataTable rows={rows} rowKey={(r) => r.id} columns={columns} searchText={(r) => r.name} pageSize={10} />
  );

  it("pages through rows and clamps the buttons at both ends", () => {
    render(table());
    expect(screen.getByText("Showing 1–10 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByText("Alpha 1")).toBeInTheDocument();
    expect(screen.queryByText("Beta 12")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 11–20 of 25")).toBeInTheDocument();
    expect(screen.getByText("Beta 12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 21–25 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("returns to page 1 on search and hides pagination when everything fits", () => {
    render(table());
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha" } }); // 13 matches
    expect(screen.getByText("Showing 1–10 of 13")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha 1" } }); // Alpha 1, 11, 13, 15, ... few
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("hides low-priority columns on small screens via responsive classes", () => {
    render(
      <DataTable
        rows={[{ id: "1", a: "x", b: "y" }]}
        rowKey={(r) => r.id}
        columns={[
          { header: "A", render: (r) => r.a },
          { header: "B", hideBelow: "lg", render: (r) => r.b },
        ]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "B" }).className).toContain("md:max-lg:hidden");
    expect(screen.getByRole("columnheader", { name: "A" }).className).not.toContain("hidden");
  });
});

describe("formatting and series helpers", () => {
  it("formatCompact uses Indian units", () => {
    expect(formatCompact(999)).toBe("₹999");
    expect(formatCompact(25000)).toBe("₹25K");
    expect(formatCompact(182379)).toBe("₹1.8L");
    expect(formatCompact(25000000)).toBe("₹2.5Cr");
    expect(formatCompact(-150000)).toBe("−₹1.5L");
  });

  it("cashSeries is built from the real ledger, oldest first, as available + reserved", () => {
    const tx = (id: string, avail: string, res: string, at: string) =>
      ({ id, available_after: avail, reserved_after: res, created_at: at }) as unknown as WalletTx;
    const newestFirst = [tx("c", "900", "100", "2026-01-03T00:00:00Z"), tx("b", "1500", "0", "2026-01-02T00:00:00Z"), tx("a", "1000", "0", "2026-01-01T00:00:00Z")];
    expect(cashSeries(newestFirst).map((p) => p.value)).toEqual([1000, 1500, 1000]);
    expect(cashSeries([])).toEqual([]);
  });
});

describe("LineChart", () => {
  const points = [
    { time: "2026-01-01T00:00:00Z", value: 1000 },
    { time: "2026-01-02T00:00:00Z", value: 1500 },
    { time: "2026-01-10T00:00:00Z", value: 1200 },
  ];

  it("is an accessible image summarising the series and plots every point", () => {
    const { container } = render(<LineChart points={points} format={(n) => `v${n}`} label="Balance" />);
    expect(screen.getByRole("img", { name: /balance\. from v1000 to v1200/i })).toBeInTheDocument();
    expect(container.querySelectorAll("path").length).toBe(2); // area + line
    expect(container.querySelector("path[stroke]")?.getAttribute("d")?.match(/[ML]/g)).toHaveLength(3);
  });

  it("plots on a true time axis (a gap of 8 days is wider than a gap of 1 day)", () => {
    const { container } = render(<LineChart points={points} format={String} label="x" />);
    const d = container.querySelector("path[stroke]")!.getAttribute("d")!;
    const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
    expect(xs[2] - xs[1]).toBeGreaterThan((xs[1] - xs[0]) * 5);
  });

  it("shows a tooltip with the hovered value", () => {
    render(<LineChart points={points} format={(n) => `₹${n}`} label="x" />);
    fireEvent.pointerMove(screen.getByRole("img"), { clientX: 9999 }); // far right -> last point
    expect(screen.getByRole("status")).toHaveTextContent("₹1200");
  });
});

describe("cards and empty states", () => {
  it("MetricCard keeps the MOCK DATA badge visible and unmocked cards clean", () => {
    const { rerender } = render(<MetricCard label="Signals today" value="0" hint="none" mock />);
    expect(screen.getByText("MOCK DATA")).toBeInTheDocument();
    expect(screen.getByText("SIGNALS TODAY", { exact: false })).toBeInTheDocument();
    rerender(<MetricCard label="Signals today" value="0" hint="none" />);
    expect(screen.queryByText("MOCK DATA")).not.toBeInTheDocument();
  });

  it("EmptyState can show decorative artwork without exposing it to assistive tech", () => {
    const { container } = render(<EmptyState title="No admins yet" description="Create one." illustration="users" />);
    expect(screen.getByText("No admins yet")).toBeInTheDocument();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
