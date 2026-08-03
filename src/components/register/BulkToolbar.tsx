"use client";

import { useState } from "react";
import type { Priority, Status, User } from "@/lib/types";

interface BulkPatch {
  statusId?: string;
  assigneeId?: string | null;
  priorityId?: string;
}

export function BulkToolbar({
  selectedCount,
  statuses,
  priorities,
  assignableUsers,
  onClear,
  onApply,
}: {
  selectedCount: number;
  statuses: Status[];
  priorities: Priority[];
  assignableUsers: User[];
  onClear: () => void;
  onApply: (patch: BulkPatch) => Promise<void> | void;
}) {
  const [statusId, setStatusId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  const patch: BulkPatch = {};
  if (statusId) patch.statusId = statusId;
  if (assigneeId) patch.assigneeId = assigneeId === "__unassign__" ? null : assigneeId;
  if (priorityId) patch.priorityId = priorityId;
  const hasChange = Object.keys(patch).length > 0;

  async function handleConfirm() {
    setApplying(true);
    await onApply(patch);
    setApplying(false);
    setConfirming(false);
    setStatusId("");
    setAssigneeId("");
    setPriorityId("");
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-white">
      <span className="text-sm font-semibold">{selectedCount} item dipilih</span>

      <select
        value={statusId}
        onChange={(e) => setStatusId(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white outline-none"
      >
        <option value="">Ubah status…</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nama}
          </option>
        ))}
      </select>

      <select
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white outline-none"
      >
        <option value="">Ubah assignee…</option>
        <option value="__unassign__">Batalkan penugasan</option>
        {assignableUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nama}
          </option>
        ))}
      </select>

      <select
        value={priorityId}
        onChange={(e) => setPriorityId(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white outline-none"
      >
        <option value="">Ubah prioritas…</option>
        {priorities.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nama}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-white"
        >
          Batal pilih
        </button>
        <button
          type="button"
          disabled={!hasChange}
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-zinc-900 disabled:opacity-40"
        >
          Terapkan
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-900 shadow-lg">
            <h2 className="text-base font-semibold">Konfirmasi update massal</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Perubahan berikut akan diterapkan ke <strong>{selectedCount} clash</strong> terpilih:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-zinc-700">
              {patch.statusId && (
                <li>• Status → {statuses.find((s) => s.id === patch.statusId)?.nama}</li>
              )}
              {patch.assigneeId !== undefined && (
                <li>
                  • Assignee →{" "}
                  {patch.assigneeId === null
                    ? "Batalkan penugasan"
                    : assignableUsers.find((u) => u.id === patch.assigneeId)?.nama}
                </li>
              )}
              {patch.priorityId && (
                <li>• Prioritas → {priorities.find((p) => p.id === patch.priorityId)?.nama}</li>
              )}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={applying}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={applying}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {applying ? "Menerapkan…" : "Ya, terapkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
