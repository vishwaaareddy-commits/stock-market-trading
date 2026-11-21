import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendStatus } from "@/components/layout/BackendStatus";
import { MarketDataStatus } from "@/components/layout/MarketDataStatus";

afterEach(() => vi.unstubAllGlobals());

describe("BackendStatus", () => {
  it("shows online when the health endpoint returns ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }));
    render(<BackendStatus />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Backend API online"));
  });

  it("shows offline with the HTTP reason on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<BackendStatus />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Backend API offline"));
    expect(screen.getByRole("status")).toHaveTextContent("HTTP 404");
  });
});

describe("MarketDataStatus", () => {
  it("never claims a provider is connected and is independent of the backend", () => {
    render(<MarketDataStatus />);
    expect(screen.getByRole("status")).toHaveTextContent("Market data: not connected");
    expect(screen.getByRole("status")).not.toHaveTextContent(/upstox|online/i);
  });
});
