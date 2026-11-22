"use client";

import { ChevronDown, Eye, EyeOff } from "lucide-react";
import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

const CONTROL_BASE =
  "h-10 rounded-xl border border-line bg-elevated px-3.5 text-sm text-foreground placeholder:text-muted outline-none transition-[border-color,box-shadow] hover:border-secondary/40 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

const BUTTON_VARIANTS = {
  primary: "bg-accent text-on-accent shadow-glow hover:brightness-110 active:brightness-95",
  secondary: "border border-line bg-elevated text-foreground hover:border-accent/50 hover:bg-surface",
  ghost: "text-secondary hover:bg-elevated hover:text-foreground",
} as const;

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:brightness-100 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL_BASE} w-full ${className}`} {...props} />;
}

/** Password field with a show/hide toggle. The toggle is a real button (keyboard + screen-reader friendly). */
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? "text" : "password"} className={`${CONTROL_BASE} w-full pr-11 ${className}`} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-foreground disabled:opacity-50"
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`${CONTROL_BASE} w-full appearance-none pr-9 ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

/** Label + control wrapper with optional hint, keeping spacing consistent across forms. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium tracking-wide text-secondary">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
