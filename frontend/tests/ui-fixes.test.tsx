import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button, PasswordInput } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { WalletAdjustDialog } from "@/components/wallet/WalletAdjustDialog";
import { HttpError } from "@/lib/client";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), login: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, status: "anonymous", login: nav.login, logout: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.replace.mockClear();
  nav.login.mockReset();
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const TX = {
  id: "11111111-aaaa", type: "ADMIN_RECHARGE", amount: "100.0000", reserved_delta: "0.0000", available_before: "0.0000",
  available_after: "100.0000", reserved_before: "0.0000", reserved_after: "0.0000", paper_order_id: null,
  paper_trade_id: null, description: "x", actor_user_id: 1, created_at: "2026-01-01T00:00:00Z",
};

describe("dialog typing keeps focus in the field being edited (regression)", () => {
  it("does not jump back to the first field on each keystroke", () => {
    render(<WalletAdjustDialog open target={{ id: 7, username: "alice" }} onClose={vi.fn()} onDone={vi.fn()} />);
    const amount = screen.getByLabelText(/amount/i);
    const reason = screen.getByLabelText(/reason/i);

    amount.focus();
    for (const v of ["1", "10", "100"]) {
      fireEvent.change(amount, { target: { value: v } }); // every change re-renders the parent
      expect(document.activeElement).toBe(amount);
    }
    reason.focus();
    for (const v of ["M", "Mo", "Monthly top-up"]) {
      fireEvent.change(reason, { target: { value: v } });
      expect(document.activeElement).toBe(reason);
    }
  });

  it("generic Dialog: a parent re-render with a NEW onClose function does not re-focus", () => {
    function Host() {
      const [text, setText] = useState("");
      return (
        <Dialog open title="T" onClose={() => setText("")}>
          <input aria-label="first" />
          <input aria-label="second" value={text} onChange={(e) => setText(e.target.value)} />
        </Dialog>
      );
    }
    render(<Host />);
    const second = screen.getByLabelText("second");
    second.focus();
    fireEvent.change(second, { target: { value: "abc" } });
    expect(document.activeElement).toBe(second);
  });

  it("still closes on Escape using the latest handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog open title="T" onClose={first}><button>ok</button></Dialog>);
    rerender(<Dialog open title="T" onClose={second}><button>ok</button></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("the full flow works: type amount and reason, then the funds are added", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => TX, headers: new Headers() });
    const onDone = vi.fn();
    render(<WalletAdjustDialog open target={{ id: 7, username: "alice" }} onClose={vi.fn()} onDone={onDone} />);
    const submit = screen.getByRole("button", { name: "Add funds" });
    expect(submit).toBeDisabled();
    const amount = screen.getByLabelText(/amount/i);
    const reason = screen.getByLabelText(/reason/i);
    amount.focus();
    fireEvent.change(amount, { target: { value: "100" } });
    reason.focus();
    fireEvent.change(reason, { target: { value: "Monthly allocation" } });
    expect(document.activeElement).toBe(reason);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(TX));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      kind: "RECHARGE", amount: "100", reason: "Monthly allocation",
    });
  });
});

describe("PasswordInput", () => {
  it("toggles between hidden and visible with an accessible button", () => {
    render(<PasswordInput aria-label="pw" defaultValue="Secret-123" />);
    const input = screen.getByLabelText("pw") as HTMLInputElement;
    expect(input.type).toBe("password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("the toggle never submits a surrounding form", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><PasswordInput aria-label="pw" /><Button type="submit">go</Button></form>);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("login page: show password and the verifying -> signed in sequence", () => {
  async function renderLogin() {
    const Page = (await import("@/app/login/page")).default;
    render(<Page />);
    fireEvent.change(screen.getByLabelText(/username or email/i), { target: { value: "boss" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "Correct-Horse-9-Battery" } });
  }

  it("can reveal the password", async () => {
    await renderLogin();
    const input = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
  });

  it("shows 'Verifying credentials…', then 'Signed in', then redirects", async () => {
    let resolveLogin: (u: unknown) => void = () => undefined;
    nav.login.mockReturnValue(new Promise((r) => (resolveLogin = r)));
    await renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const busy = await screen.findByRole("button", { name: /verifying credentials/i });
    expect(busy).toBeDisabled();
    expect(screen.getByLabelText(/username or email/i)).toBeDisabled(); // no edits mid-verification
    expect(nav.replace).not.toHaveBeenCalled();

    resolveLogin({ id: 1, must_change_password: false });
    expect(await screen.findByRole("button", { name: /signed in/i })).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"), { timeout: 3000 });
  });

  it("sends a user with a temporary password to the change-password page", async () => {
    nav.login.mockResolvedValue({ id: 2, must_change_password: true });
    await renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/change-password"), { timeout: 3000 });
  });

  it("wrong credentials: shows the error, clears the password and re-enables the form", async () => {
    nav.login.mockRejectedValue(new HttpError(401, "Invalid username or password"));
    await renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect((screen.getByLabelText(/^password$/i) as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText(/username or email/i)).toBeEnabled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
