import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, fetchHealth } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchHealth", () => {
  it("returns the parsed health response", async () => {
    const body = { status: "ok", app: "x", environment: "test", trading_mode: "paper" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHealth()).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/health`);
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchHealth()).rejects.toThrow("500");
  });
});
