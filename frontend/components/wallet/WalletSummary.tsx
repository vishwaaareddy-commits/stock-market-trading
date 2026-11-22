import { Banknote, Lock, PiggyBank, TrendingUp, Wallet as WalletIcon } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { formatSigned, formatVirtual, signTone } from "@/lib/money";
import type { Wallet } from "@/lib/types";

/** Available, reserved, equity and P&L are shown separately. All amounts are VIRTUAL. */
export function WalletSummary({ wallet }: { wallet: Wallet }) {
  const unreal = wallet.unrealized_pnl;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
      <MetricCard label="Available" value={formatVirtual(wallet.available_balance)} icon={WalletIcon} hint="Free to trade" />
      <MetricCard label="Reserved" value={formatVirtual(wallet.reserved_balance)} icon={Lock} hint="Held for pending BUY orders" />
      <MetricCard
        label="Total equity"
        value={formatVirtual(wallet.total_equity)}
        icon={PiggyBank}
        hint={wallet.equity_basis === "market" ? "Holdings at last market price" : "Holdings at cost (no market price)"}
      />
      <MetricCard
        label="Realized P&L"
        value={formatSigned(wallet.realized_pnl)}
        icon={Banknote}
        trend={{
          value: Number(wallet.realized_pnl),
          label: signTone(wallet.realized_pnl) === "neutral" ? "No closed trades" : "Closed trades",
        }}
      />
      <MetricCard
        label="Unrealized P&L"
        value={unreal === null ? "—" : formatSigned(unreal)}
        icon={TrendingUp}
        hint={unreal === null ? "Needs a market price" : "Open positions"}
      />
    </div>
  );
}
