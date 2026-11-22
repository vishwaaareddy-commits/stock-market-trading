"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { HttpError, api, newIdempotencyKey } from "@/lib/client";
import { formatVirtual, isValidAmount } from "@/lib/money";
import { useApi } from "@/lib/useApi";
import type { Order } from "@/lib/types";

type Instrument = { id: number; symbol: string; exchange: string; name: string | null };

/**
 * Places a PAPER order (never sent to any broker). The Idempotency-Key is generated once per
 * order intent and reused if the request is retried, so a retry can never reserve funds twice.
 */
export function OrderForm({ onPlaced }: { onPlaced: () => void }) {
  const instruments = useApi<Instrument[]>("/paper/instruments");
  const [instrumentId, setInstrumentId] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Created lazily at submit time, never during render (Cache Components forbids random values there).
  const key = useRef<string | null>(null);

  // Editing any field starts a new order intent (new key); an unchanged retry reuses the key.
  const rotateKey = () => {
    key.current = null; // next submit creates a fresh key
  };

  const qtyOk = /^[1-9]\d{0,6}$/.test(qty);
  const priceOk = isValidAmount(price);
  const ready = Boolean(instrumentId) && qtyOk && priceOk;
  const estimate = qtyOk && priceOk ? formatVirtual(String(Number(qty) * Number(price))) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const order = await api<Order>("/paper/orders", {
        method: "POST",
        headers: { "Idempotency-Key": (key.current ??= newIdempotencyKey()) },
        body: { instrument_id: Number(instrumentId), side, quantity: Number(qty), limit_price: price.trim() },
      });
      setOk(`Paper order #${order.id} placed (${order.status}).`);
      key.current = null; // new intent next time
      setQty("");
      setPrice("");
      onPlaced();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not place the order.");
      if (err instanceof HttpError && err.status !== 0) key.current = null;
    } finally {
      setBusy(false);
    }
  }

  if (instruments.data && instruments.data.length === 0) {
    return (
      <EmptyState
        title="No instruments available yet"
        description="Paper orders need instruments to exist. They appear here once market instruments are loaded into the system."
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-center gap-2">
        <VirtualBadge />
        <span className="text-xs text-muted">Simulated order. Nothing is sent to a broker.</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Instrument" htmlFor="po-instrument">
          <Select id="po-instrument" value={instrumentId} onChange={(e) => { rotateKey(); setInstrumentId(e.target.value); }} disabled={!instruments.data}>
            <option value="">{instruments.loading ? "Loading…" : "Select"}</option>
            {instruments.data?.map((i) => (
              <option key={i.id} value={i.id}>{i.symbol} · {i.exchange}</option>
            ))}
          </Select>
        </Field>
        <Field label="Side" htmlFor="po-side" hint="Long only; no short selling">
          <Select id="po-side" value={side} onChange={(e) => { rotateKey(); setSide(e.target.value as typeof side); }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="po-qty">
          <Input id="po-qty" inputMode="numeric" value={qty} onChange={(e) => { rotateKey(); setQty(e.target.value); }} />
        </Field>
        <Field label="Limit price (virtual ₹)" htmlFor="po-price">
          <Input id="po-price" inputMode="decimal" value={price} onChange={(e) => { rotateKey(); setPrice(e.target.value); }} />
        </Field>
      </div>
      {estimate && <p className="text-xs text-secondary">Order value ≈ {estimate} (plus simulated charges for BUY).</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {ok && <Notice tone="success">{ok}</Notice>}
      <Button variant="primary" type="submit" disabled={!ready || busy}>
        {busy ? "Placing…" : `Place paper ${side}`}
      </Button>
    </form>
  );
}
