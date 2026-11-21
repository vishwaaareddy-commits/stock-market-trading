import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { DataTable } from "@/components/ui/DataTable";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { formatPercent, formatPrice } from "@/lib/format";

vi.mock("next/navigation", () => ({ usePathname: () => "/signals" }));

describe("navigation", () => {
  it("contains all required sections", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Overview",
      "Strategies",
      "Market Data",
      "Signals",
      "Paper Trading",
      "Backtesting",
      "Settings",
    ]);
  });

  it("matches active routes", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/signals", "/")).toBe(false);
    expect(isActive("/signals/1", "/signals")).toBe(true);
  });

  it("renders sidebar links and marks the current page", () => {
    render(<Sidebar />);
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
    expect(screen.getByRole("link", { name: "Signals" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});

describe("mock data labelling", () => {
  it("shows a mock data notice", () => {
    render(<MockDataNotice />);
    expect(screen.getByRole("note")).toHaveTextContent("MOCK DATA");
  });
});

describe("DataTable", () => {
  it("renders rows and an empty state", () => {
    const { rerender } = render(
      <DataTable rows={[{ id: "a", n: 1 }]} rowKey={(r) => r.id} columns={[{ header: "N", render: (r) => r.n }]} />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    rerender(<DataTable rows={[]} rowKey={(r: { id: string }) => r.id} columns={[]} emptyMessage="Nothing" />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });
});

describe("format", () => {
  it("formats numbers", () => {
    expect(formatPrice(1234.5)).toBe("1,234.50");
    expect(formatPercent(1.234)).toBe("+1.23%");
    expect(formatPercent(-0.5)).toBe("-0.50%");
  });
});
