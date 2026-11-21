import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchHealth, normalizeApiBase } from "@/lib/api";

const BASE = "https://api.example.com/api/v1";
const OK_BODY = { status: "ok", app: "x", environment: "test", trading_mode: "paper" };

afterEach(() => vi.unstubAllGlobals());

describe("normalizeApiBase", () => {
  it("appends /api/v1 to a bare origin (the Vercel misconfiguration)", () => {
    expect(normalizeApiBase("https://x.onrender.com")).toBe("https://x.onrender.com/api/v1");
    expect(normalizeApiBase("https://x.onrender.com/")).toBe("https://x.onrender.com/api/v1");
  });
  it("keeps an existing /api/v1 suffix", () => {
    expect(normalizeApiBase("https://x.onrender.com/api/v1")).toBe("https://x.onrender.com/api/v1");
    expect(normalizeApiBase("https://x.onrender.com/api/v1/")).toBe("https://x.onrender.com/api/v1");
  });
  it("falls back to local backend when unset or blank", () => {
    expect(normalizeApiBase(undefined)).toBe("http://127.0.0.1:8000/api/v1");
    expect(normalizeApiBase("  ")).toBe("http://127.0.0.1:8000/api/v1");
  });
});

describe("fetchHealth", () => {
  it("calls <base>/health and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => OK_BODY });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchHealth(undefined, BASE)).resolves.toEqual(OK_BODY);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/health`);
  });

  it("reports the HTTP status on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const err = await fetchHealth(undefined, BASE).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "http", httpStatus: 404 });
  });

  it("classifies network/CORS failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchHealth(undefined, BASE)).rejects.toMatchObject({ kind: "network" });
  });

  it("rejects invalid JSON and a non-ok status field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("x"); } }));
    await expect(fetchHealth(undefined, BASE)).rejects.toMatchObject({ kind: "invalid-response" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "degraded" }) }));
    await expect(fetchHealth(undefined, BASE)).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
