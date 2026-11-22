"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";

/** Shows a generated temporary password exactly once. It is not retrievable afterwards. */
export function CredentialDialog({
  open,
  username,
  password,
  onClose,
}: {
  open: boolean;
  username: string;
  password: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={open && password !== null}
      onClose={onClose}
      title="Temporary password"
      description={`For ${username}. They must change it at first sign-in.`}
      footer={
        <Button variant="primary" onClick={onClose}>
          I have saved it
        </Button>
      }
    >
      <div className="space-y-4">
        <Notice tone="info">This password is shown only once and cannot be viewed again. Share it securely.</Notice>
        <div className="flex items-center gap-2">
          <code
            data-testid="temp-password"
            className="min-w-0 flex-1 select-all break-all rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-sm text-foreground"
          >
            {password}
          </code>
          <Button onClick={copy} aria-label="Copy password">
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
