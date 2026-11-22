import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialDialog } from "@/components/admin/CredentialDialog";
import { WalletAdjustDialog } from "@/components/wallet/WalletAdjustDialog";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { LedgerTable } from "@/components/wallet/LedgerTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Wallet, WalletTx } from "@/lib/types";

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const ok = (body: unknown, status = 201) =>
  ({ ok: true, status, json: async () => body, headers: new Headers() }) as Response;
const fail = (status: number, detail: unknown) =>
  ({ ok: false, status, json: async () => ({ detail }), headers: new Headers() }) as Response;

const TX: WalletTx = {
  id: "11111111-aaaa-bbbb-cccc-222222222222", type: "ADMIN_RECHARGE", amount: "100.0000", reserved_delta: "0.0000",
  available_before: "0.0000", available_after: "100.0000", reserved_before: "0.0000", reserved_after: "0.0000",
  paper_order_id: null, paper_trade_id: null, description: "top up", actor_user_id: 1, created_at: "2026-01-01T00:00:00Z",
};

function renderDialog(onDone = vi.fn(), onClose = vi.fn()) {
  render(<WalletAdjustDialog open target={{ id: 7, username: "alice" }} onClose={onClose} onDone={onDone} />);
  return { onDone, onClose };
}

describe("WalletAdjustDialog (virtual funds)", () => {
  it("resets to Recharge after a cancelled Deduct, so the next dialog never opens in Deduct mode", () => {
    const { onClose } = renderDialog();
    fireEvent.change(screen.getByLabelText(/type|action|kind/i), { target: { value: "DEDUCT" } });
    expect(screen.getByRole("button", { name: "Deduct funds" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add funds" })).toBeInTheDocument();
  });

  it("is labelled virtual and blocks submit until amount and reason are valid", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: /recharge virtual funds/i })).toBeInTheDocument();
    expect(screen.getByText("VIRTUAL · PAPER")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Add funds" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "250.50" } });
    expect(submit).toBeDisabled(); // reason still missing
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "ab" } });
    expect(submit).toBeDisabled(); // too short
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Monthly allocation" } });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "1.234" } });
    expect(submit).toBeDisabled(); // more than 2 decimals
  });

  it("posts the adjustment with a reason and an Idempotency-Key", async () => {
    fetchMock.mockResolvedValueOnce(ok(TX));
    const { onDone, onClose } = renderDialog();
    fireEvent.change(screen.getByLabelText(/action/i), { target: { value: "DEDUCT" } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Deduct funds" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(TX));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/wallets/7/adjust");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "DEDUCT", amount: "40", reason: "Correction" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/.{8,}/);
    expect(onClose).toHaveBeenCalled();
  });

  it("reuses the SAME idempotency key when the user retries after an error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok(TX));
    renderDialog();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Retry case" } });
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const keys = fetchMock.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("uses a NEW idempotency key once the user edits the form (the server rejects key reuse with different details)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderDialog();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "First attempt" } });
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "25" } }); // changed details
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const keys = fetchMock.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("shows a clear message when the server reports an idempotency conflict", async () => {
    fetchMock.mockResolvedValueOnce(fail(409, { code: "idempotency_conflict", message: "This Idempotency-Key was already used for a different adjustment" }));
    renderDialog();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Conflict case" } });
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/different adjustment/i);
  });

  it("shows server errors such as insufficient funds and stays open", async () => {
    fetchMock.mockResolvedValueOnce(fail(409, { code: "insufficient_funds", message: "Insufficient virtual funds" }));
    const { onDone } = renderDialog();
    fireEvent.change(screen.getByLabelText(/action/i), { target: { value: "DEDUCT" } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "999999" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Too much" } });
    fireEvent.click(screen.getByRole("button", { name: "Deduct funds" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient virtual funds");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CredentialDialog", () => {
  it("shows the one-time password with a warning", () => {
    render(<CredentialDialog open username="alice" password="Temp-Pass-1234!" onClose={vi.fn()} />);
    expect(screen.getByTestId("temp-password")).toHaveTextContent("Temp-Pass-1234!");
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
  });

  it("renders nothing without a password", () => {
    render(<CredentialDialog open username="alice" password={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("confirms and cancels", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open title="Delete?" description="Soft delete" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("wallet display", () => {
  const wallet: Wallet = {
    currency: "VIRTUAL_INR", is_virtual: true, available_balance: "8999.7000", reserved_balance: "1000.3000",
    invested_cost: "0.0000", realized_pnl: "-12.5000", unrealized_pnl: null, total_equity: "10000.0000", equity_basis: "cost",
  };

  it("shows available, reserved, realized and unrealized separately without inventing values", () => {
    render(<WalletSummary wallet={wallet} />);
    expect(screen.getByText("₹8,999.70")).toBeInTheDocument();
    expect(screen.getByText("₹1,000.30")).toBeInTheDocument();
    expect(screen.getByText("−₹12.50")).toBeInTheDocument();
    expect(screen.getByText("Needs a market price")).toBeInTheDocument(); // unrealized unknown -> no fake number
    expect(screen.getByText("Holdings at cost (no market price)")).toBeInTheDocument();
  });

  it("renders the ledger with types and an empty state", () => {
    const { rerender } = render(<LedgerTable rows={[TX]} />);
    expect(screen.getAllByText("ADMIN RECHARGE").length).toBeGreaterThan(0); // type column (+ compact badge on phones)
    expect(screen.getByText("+₹100.00")).toBeInTheDocument();
    rerender(<LedgerTable rows={[]} />);
    expect(screen.getByText("No wallet transactions yet.")).toBeInTheDocument();
  });
});
