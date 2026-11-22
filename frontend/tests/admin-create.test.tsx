import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderForm } from "@/components/paper/OrderForm";
import { WalletAdjustDialog } from "@/components/wallet/WalletAdjustDialog";
import { checkPassword } from "@/lib/auth-helpers";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users/new",
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.push.mockClear();
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as Response;

const CREATED = {
  user: { id: 9, username: "newadmin", email: "n@example.com", display_name: null, role: "ADMIN", is_active: true,
    created_at: "2026-01-01T00:00:00Z", last_login_at: null, last_activity_at: null, last_heartbeat_at: null,
    deleted_at: null, online: false, active_sessions: 0, available_balance: "0.0000", reserved_balance: "0.0000" },
  temporary_password: null as string | null,
};

describe("checkPassword (mirrors the server policy)", () => {
  it("flags each unmet rule", () => {
    const r = checkPassword("short", "alice", "a@example.com");
    expect(r.valid).toBe(false);
    expect(r.rules.find((x) => x.id === "length")?.ok).toBe(false);
    expect(r.rules.find((x) => x.id === "mix")?.ok).toBe(false);
  });
  it("accepts a strong password and rejects ones containing the username or email name", () => {
    expect(checkPassword("Correct-Horse-9-Battery", "alice", "a@example.com").valid).toBe(true);
    expect(checkPassword("Alice-Strong-Pass-99!", "alice", "x@example.com").valid).toBe(false);
    expect(checkPassword("Trader-Strong-Pass-99!", "bob", "trader@example.com").valid).toBe(false);
    expect(checkPassword("lowercaseonlypassword", "x", "").valid).toBe(false); // one character class
  });
});

describe("Create admin: generated or custom password", () => {
  async function renderPage() {
    const Page = (await import("@/app/admin/users/new/page")).default;
    render(<Page />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newadmin" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "n@example.com" } });
  }

  it("offers both options, defaulting to generate", async () => {
    await renderPage();
    const [generate, custom] = screen.getAllByRole("radio");
    expect(generate).toBeChecked();
    expect(custom).not.toBeChecked();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create admin" })).toBeEnabled();
  });

  it("custom: guides with a live checklist, requires a match, then sends the chosen password", async () => {
    fetchMock.mockResolvedValueOnce(json(CREATED, 201));
    await renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /set a custom password/i }));
    const submit = screen.getByRole("button", { name: "Create admin" });
    expect(submit).toBeDisabled();

    const pw = screen.getByLabelText("Password");
    const confirm = screen.getByLabelText("Confirm password");
    fireEvent.change(pw, { target: { value: "short" } });
    expect(screen.getByRole("list", { name: /password requirements/i })).toHaveTextContent("(not met)");
    expect(submit).toBeDisabled();

    fireEvent.change(pw, { target: { value: "Custom-Passw0rd-Strong!" } });
    expect(submit).toBeDisabled(); // not confirmed yet
    fireEvent.change(confirm, { target: { value: "Custom-Passw0rd-Different" } });
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(confirm, { target: { value: "Custom-Passw0rd-Strong!" } });
    expect(submit).toBeEnabled();

    const toggles = screen.getAllByRole("button", { name: "Show password" }); // one per field
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]);
    expect((pw as HTMLInputElement).type).toBe("text"); // the chosen password can be revealed and checked
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ username: "newadmin", email: "n@example.com", password: "Custom-Passw0rd-Strong!" });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/admin/users/9")); // no temp-password dialog needed
  });

  it("generate: sends no password and shows the one-time temporary password", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...CREATED, temporary_password: "Temp-Generated-1234!" }, 201));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Create admin" }));
    await waitFor(() => expect(screen.getByTestId("temp-password")).toHaveTextContent("Temp-Generated-1234!"));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.password).toBeNull();
  });

  it("custom password with the username inside is not accepted by the form", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /set a custom password/i }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Newadmin-Strong-Pass-99!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Newadmin-Strong-Pass-99!" } });
    expect(screen.getByRole("button", { name: "Create admin" })).toBeDisabled();
  });
});

describe("no random values are generated during render (Next.js Cache Components rule)", () => {
  it("rendering the wallet dialog (even closed) and the order form never calls crypto.randomUUID", () => {
    fetchMock.mockResolvedValue(json([]));
    const uuid = vi.spyOn(crypto, "randomUUID");
    const rand = vi.spyOn(Math, "random");
    render(<WalletAdjustDialog open={false} target={null} onClose={vi.fn()} onDone={vi.fn()} />);
    render(<WalletAdjustDialog open target={{ id: 1, username: "a" }} onClose={vi.fn()} onDone={vi.fn()} />);
    render(<OrderForm onPlaced={vi.fn()} />);
    expect(uuid).not.toHaveBeenCalled();
    expect(rand).not.toHaveBeenCalled();
  });

  it("creates the idempotency key only when the form is submitted, and reuses it on an unchanged retry", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(json({ id: 1 }, 201));
    const uuid = vi.spyOn(crypto, "randomUUID");
    render(<WalletAdjustDialog open target={{ id: 1, username: "a" }} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Top-up now" } });
    expect(uuid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(uuid).toHaveBeenCalledTimes(1); // one intent -> one key, reused for the retry
    const keys = fetchMock.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
  });
});
