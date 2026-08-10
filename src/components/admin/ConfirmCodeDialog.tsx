"use client";

import { useState } from "react";

/**
 * Type-to-confirm dialog for irreversible-ish admin actions that need more
 * friction than a plain confirm() — modeled on
 * src/components/clashes/DeleteClashDialog.tsx. Unlike that dialog, this one
 * does NOT close itself on a failed onConfirm (e.g. a 409 from the server) —
 * the caller controls `open`/`error` so the failure stays visible right next
 * to the retry.
 */
export function ConfirmCodeDialog({
  title,
  description,
  codeToType,
  confirmLabel,
  confirmingLabel,
  tone = "danger",
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: React.ReactNode;
  codeToType: string;
  confirmLabel: string;
  confirmingLabel: string;
  tone?: "danger" | "warning";
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const confirmed = typed.trim() === codeToType;

  async function handleConfirm() {
    if (!confirmed) return;
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  }

  const toneClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-amber-600 hover:bg-amber-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-900 shadow-lg">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-zinc-600">{description}</div>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {error}
          </p>
        )}
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Ketik <span className="font-mono">{codeToType}</span> untuk konfirmasi
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-zinc-300"
            autoFocus
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!confirmed || confirming}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${toneClass}`}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
