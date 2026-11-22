import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataTable } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { NAV_ITEMS, findNavItem, isActive } from "@/lib/nav";
import { formatCurrency, formatPercent, formatPrice, valueTone } from "@/lib/format";

const state = vi.hoisted(() => ({
  path: "/signals",
  replace: vi.fn(),
  push: vi.fn(),
  auth: {
    user: { id: 2, username: "alice", display_name: "Alice", role: "ADMIN", must_change_password: false },
    status: "authenticated",
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  } as Record<string, unknown>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useRouter: () => ({ replace: state.replace, push: state.push }),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => state.auth,
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }));

describe("navigation", () => {
  it("contains all required sections in order, with unchanged destinations", () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ["Overview", "/"],
      ["Strategies", "/strategies"],
      ["Market Data", "/market-data"],
      ["Signals", "/signals"],
      ["Paper Trading", "/paper-trading"],
      ["Backtesting", "/backtesting"],
      ["Settings", "/settings"],
    ]);
    NAV_ITEMS.forEach((i) => expect(i.icon).toBeDefined());
  });

  it("matches active routes", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/signals", "/")).toBe(false);
    expect(isActive("/signals/1", "/signals")).toBe(true);
    expect(findNavItem("/paper-trading")?.label).toBe("Paper Trading");
    expect(findNavItem("/nope")).toBeUndefined();
  });

  it("renders identity, sidebar links and marks the current page", () => {
    state.path = "/signals";
    render(<Sidebar />);
    expect(screen.getByText("Trading System")).toBeInTheDocument();
    expect(screen.getByText("NSE · Paper Trading")).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getAllByRole("link")).toHaveLength(NAV_ITEMS.length + 1); // + My Wallet
    expect(nav.getByRole("link", { name: "Signals" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});

describe("Topbar", () => {
  it("shows page title, paper-only badge, theme toggle and both status chips exactly once", () => {
    state.path = "/market-data";
    render(<Topbar />);
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Market Data")).toBeInTheDocument();
    expect(screen.getByText("PAPER TRADING ONLY")).toBeInTheDocument();
    expect(screen.getAllByText("Market data: not connected")).toHaveLength(1);
    expect(screen.getAllByText(/Checking backend API|Backend API/)).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
  });
});

describe("AppShell mobile drawer", () => {
  it("opens from the menu button and closes on Escape and via the close button", () => {
    state.path = "/";
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const menu = screen.getByRole("button", { name: "Open navigation" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).not.toBe("hidden");

    fireEvent.click(menu);
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer when a navigation link is chosen", () => {
    state.path = "/";
    render(<AppShell>x</AppShell>);
    const menu = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menu);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Signals" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});

describe("mock data labelling", () => {
  it("shows a mock data notice", () => {
    render(<MockDataNotice />);
    expect(screen.getByRole("note")).toHaveTextContent("MOCK DATA");
  });

  it("MetricCard shows the MOCK DATA badge only when flagged", () => {
    const { rerender } = render(<MetricCard label="Equity" value="₹1" mock />);
    expect(screen.getByText("MOCK DATA")).toBeInTheDocument();
    rerender(<MetricCard label="Equity" value="₹1" />);
    expect(screen.queryByText("MOCK DATA")).not.toBeInTheDocument();
  });
});

describe("DataTable", () => {
  const rows = [
    { id: "a", name: "Alpha", kind: "x" },
    { id: "b", name: "Beta", kind: "y" },
  ];
  const columns = [{ header: "Name", render: (r: (typeof rows)[number]) => r.name }];

  it("renders rows and the empty message", () => {
    const { rerender } = render(<DataTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    rerender(<DataTable rows={[]} rowKey={(r: { id: string }) => r.id} columns={[]} emptyMessage="Nothing" />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });

  it("searches, shows a no-results state, and applies an external row filter", () => {
    const { rerender } = render(
      <DataTable rows={rows} rowKey={(r) => r.id} columns={columns} searchText={(r) => r.name} />,
    );
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "bet" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No matching results")).toBeInTheDocument();

    fireEvent.change(box, { target: { value: "" } });
    rerender(
      <DataTable rows={rows} rowKey={(r) => r.id} columns={columns} searchText={(r) => r.name} rowFilter={(r) => r.kind === "x"} />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});

describe("ChartContainer", () => {
  it("shows an empty state instead of fabricating data", () => {
    render(<ChartContainer title="Equity" isEmpty emptyTitle="No history" />);
    expect(screen.getByText("No history")).toBeInTheDocument();
  });

  it("renders children when data exists", () => {
    render(
      <ChartContainer title="Equity">
        <div>plot</div>
      </ChartContainer>,
    );
    expect(screen.getByText("plot")).toBeInTheDocument();
  });
});

describe("format", () => {
  it("formats numbers", () => {
    expect(formatPrice(1234.5)).toBe("1,234.50");
    expect(formatPercent(1.234)).toBe("+1.23%");
    expect(formatPercent(-0.5)).toBe("-0.50%");
    expect(formatCurrency(100000)).toContain("1,00,000.00");
    expect(formatCurrency(100000)).toContain("₹");
  });

  it("classifies value tone", () => {
    expect(valueTone(1)).toBe("positive");
    expect(valueTone(-1)).toBe("negative");
    expect(valueTone(0)).toBe("neutral");
  });
});
