"use client";

import { Button } from "./Controls";
import { Dialog } from "./Dialog";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={busy}
            className={danger ? "!bg-negative hover:!bg-negative/90" : ""}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-secondary">{description}</p>
    </Dialog>
  );
}
