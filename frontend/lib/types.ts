// Shapes returned by the backend. Money values are decimal STRINGS (never floats) and are all
// VIRTUAL / PAPER amounts, not real money.

export type Role = "SUPER_ADMIN" | "ADMIN";

export type User = {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type AdminRow = {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  last_activity_at: string | null;
  last_heartbeat_at: string | null;
  deleted_at: string | null;
  online: boolean;
  active_sessions: number;
  available_balance: string | null;
  reserved_balance: string | null;
};

export type CredentialResult = { user: AdminRow; temporary_password: string | null };

export type Wallet = {
  currency: string;
  is_virtual: boolean;
  available_balance: string;
  reserved_balance: string;
  invested_cost: string;
  realized_pnl: string;
  unrealized_pnl: string | null;
  total_equity: string;
  equity_basis: "market" | "cost";
};

export type WalletTx = {
  id: string;
  type:
    | "INITIAL_CREDIT"
    | "ADMIN_RECHARGE"
    | "ADMIN_ADJUSTMENT"
    | "TRADE_BUY"
    | "TRADE_SELL"
    | "TRADE_CHARGE"
    | "TRADE_REFUND";
  amount: string;
  reserved_delta: string;
  available_before: string;
  available_after: string;
  reserved_before: string;
  reserved_after: string;
  paper_order_id: number | null;
  paper_trade_id: number | null;
  description: string;
  actor_user_id: number | null;
  created_at: string;
};

export type WalletRow = {
  user_id: number;
  username: string;
  role: Role;
  is_active: boolean;
  deleted: boolean;
  available_balance: string;
  reserved_balance: string;
  realized_pnl: string;
};

export type Order = {
  id: number;
  instrument_id: number;
  side: "BUY" | "SELL";
  quantity: number;
  status: "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";
  limit_price: string | null;
  fill_price: string | null;
  reserved_amount: string;
  charges: string;
  status_reason: string | null;
  created_at: string;
  filled_at: string | null;
};

export type Trade = {
  id: number;
  instrument_id: number;
  quantity: number;
  entry_price: string;
  exit_price: string | null;
  status: "OPEN" | "CLOSED";
  pnl: string | null;
  entry_charge: string;
  exit_charge: string;
  opened_at: string;
  closed_at: string | null;
};

export type Position = {
  instrument_id: number;
  symbol: string;
  quantity: number;
  avg_entry_price: string;
  cost_basis: string;
  last_price: string | null;
  unrealized_pnl: string | null;
};

export type Performance = {
  is_virtual: boolean;
  realized_pnl: string;
  unrealized_pnl: string | null;
  total_equity: string;
  closed_trades: number;
  winning_trades: number;
  win_rate: string | null;
  total_charges: string;
  open_positions: number;
};

export type AuditEntry = {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type SessionInfo = {
  id: number;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
};

export type AdminDashboard = {
  total_admins: number;
  online_admins: number;
  offline_admins: number;
  deactivated_admins: number;
  heartbeat_timeout_seconds: number;
  recent_activity: AuditEntry[];
  admin_summaries: {
    user_id: number;
    username: string;
    is_active: boolean;
    online: boolean;
    available_balance: string;
    reserved_balance: string;
    realized_pnl: string;
    orders: number;
    open_lots: number;
  }[];
};
