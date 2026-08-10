"use client";

import { useState } from "react";

export function DeleteClashDialog({
  kodeUnik,
  onCancel,
  onConfirm,
}: {
  kodeUnik: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const confirmed = typed.trim() === kodeUnik;

  async function handleConfirm() {
    if (!confirmed) return;
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-900 shadow-lg">
        <h2 className="text-base font-semibold">Hapus clash</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Clash <strong>{kodeUnik}</strong> akan disembunyikan dari Register, Dashboard, dan Clash
          Saya. Komentar, riwayat, dan lampiran tetap tersimpan dan dapat dipulihkan oleh Admin.
        </p>
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Ketik <span className="font-mono">{kodeUnik}</span> untuk konfirmasi
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            autoFocus
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!confirmed || deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {deleting ? "Menghapus…" : "Ya, hapus clash"}
          </button>
        </div>
      </div>
    </div>
  );
}
