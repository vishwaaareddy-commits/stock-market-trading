"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { HttpError, api, newIdempotencyKey } from "@/lib/client";
import { isValidAmount } from "@/lib/money";
import type { WalletTx } from "@/lib/types";

type Props = {
  open: boolean;
  target: { id: number; username: string } | null;
  onClose: () => void;
  onDone: (tx: WalletTx) => void;
};

/** Super Admin credit/debit of VIRTUAL funds. A reason is mandatory. */
export function WalletAdjustDialog({ open, target, onClose, onDone }: Props) {
  const [kind, setKind] = useState<"RECHARGE" | "DEDUCT">("RECHARGE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per user intent: retries after a network error reuse it, so funds apply at most once.
  // It is created lazily at submit time (never during render: Cache Components forbids random
  // values at render, and this dialog is rendered even while closed).
  const key = useRef<string | null>(null);

  // The server returns 409 if a key is reused with different details, so editing any field starts a
  // new intent (new key). An unchanged retry after a network error keeps the key and applies once.
  const rotateKey = () => {
    key.current = null; // next submit creates a fresh key
  };

  const amountOk = isValidAmount(amount);
  const reasonOk = reason.trim().length >= 3;

  function close() {
    setKind("RECHARGE"); // a cancelled "Deduct" must not leak into the next dialog (possibly another admin)
    setAmount("");
    setReason("");
    setError(null);
    key.current = null;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    if (!amountOk) return setError("Enter a positive amount with at most 2 decimal places.");
    if (!reasonOk) return setError("A reason of at least 3 characters is required.");
    setBusy(true);
    setError(null);
    try {
      const tx = await api<WalletTx>(`/admin/wallets/${target.id}/adjust`, {
        method: "POST",
        body: { kind, amount: amount.trim(), reason: reason.trim() },
        headers: { "Idempotency-Key": (key.current ??= newIdempotencyKey()) },
      });
      onDone(tx);
      close();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open && target !== null}
      onClose={close}
      title={`${kind === "RECHARGE" ? "Recharge" : "Deduct"} virtual funds`}
      description={target ? `Wallet of ${target.username}` : undefined}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="wallet-adjust-form" disabled={busy || !amountOk || !reasonOk}>
            {busy ? "Applying…" : kind === "RECHARGE" ? "Add funds" : "Deduct funds"}
          </Button>
        </>
      }
    >
      <form id="wallet-adjust-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-center gap-2">
          <VirtualBadge />
          <span className="text-xs text-muted">Simulated funds only. Not real money.</span>
        </div>
        <Field label="Action" htmlFor="adj-kind">
          <Select id="adj-kind" value={kind} onChange={(e) => { rotateKey(); setKind(e.target.value as typeof kind); }}>
            <option value="RECHARGE">Recharge (add virtual funds)</option>
            <option value="DEDUCT">Deduct (remove virtual funds)</option>
          </Select>
        </Field>
        <Field label="Amount (virtual ₹)" htmlFor="adj-amount" hint="Up to 2 decimal places">
          <Input
            id="adj-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => { rotateKey(); setAmount(e.target.value); }}
            placeholder="0.00"
          />
        </Field>
        <Field label="Reason (required)" htmlFor="adj-reason" hint="Recorded permanently in the ledger and audit log">
          <Input
            id="adj-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => { rotateKey(); setReason(e.target.value); }}
            placeholder="e.g. Monthly allocation"
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Dialog>
  );
}
