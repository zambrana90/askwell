"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Where focus goes on close if the element that opened the dialog is gone (e.g. after a delete). */
  fallbackFocus?: () => HTMLElement | null;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
  fallbackFocus,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Read in the first render, before focus moves into the dialog.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => {
    fallbackRef.current = fallbackFocus;
  });

  // Focus Cancel on open; give focus back on close.
  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
      else fallbackRef.current?.()?.focus();
    };
  }, [opener]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape follows the Cancel button: ignored while the request is in flight.
      if (e.key === "Escape" && !busy) onCancel();
      if (e.key === "Tab") {
        // Keep Tab inside the dialog.
        const items = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) {
          e.preventDefault();
        } else if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
      <Panel
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="max-h-full w-full max-w-md overflow-y-auto bg-canvas p-6"
      >
        <h2 id={titleId} className="text-lg font-semibold wrap-anywhere">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-ink-muted wrap-anywhere">
          {description}
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
