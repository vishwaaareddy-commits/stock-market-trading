import {
  ArrowLeftRight,
  Eye,
  KeyRound,
  LogIn,
  LogOut,
  ShieldAlert,
  Trash2,
  UserCog,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type Look = { icon: LucideIcon; tone: string };

/** Icon + colour for an audit action, so a feed can be scanned at a glance. */
export function activityLook(action: string): Look {
  if (action === "PAGE_VIEW") return { icon: Eye, tone: "bg-elevated text-muted" };
  if (action === "LOGIN_SUCCESS" || action === "SESSION_CREATED") return { icon: LogIn, tone: "bg-positive/10 text-positive" };
  if (action === "LOGOUT") return { icon: LogOut, tone: "bg-elevated text-secondary" };
  if (action === "LOGIN_FAILURE") return { icon: ShieldAlert, tone: "bg-negative/10 text-negative" };
  if (action.startsWith("WALLET")) return { icon: Wallet, tone: "bg-warning/10 text-warning" };
  if (action.startsWith("ORDER")) return { icon: ArrowLeftRight, tone: "bg-accent/10 text-accent" };
  if (action.startsWith("PASSWORD")) return { icon: KeyRound, tone: "bg-warning/10 text-warning" };
  if (action === "USER_CREATED") return { icon: UserPlus, tone: "bg-positive/10 text-positive" };
  if (action === "USER_DELETED") return { icon: Trash2, tone: "bg-negative/10 text-negative" };
  if (action.startsWith("USER") || action.startsWith("SESSIONS")) return { icon: UserCog, tone: "bg-accent-2/10 text-accent-2" };
  return { icon: Eye, tone: "bg-elevated text-muted" };
}
