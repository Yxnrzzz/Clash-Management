"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useMasterDataLookups } from "@/lib/use-master-data";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { toClash } from "@/lib/api/mappers";
import type { ApiClash, ApiClashListResponse } from "@/lib/api/types";
import { formatDateTime } from "@/lib/lookup";

const PAGE_SIZE = 100;

export default function TrashPage() {
  const { user, isLoading } = useRequireAdmin();
  const { disciplineById, statusById } = useMasterDataLookups();

  const [rows, setRows] = useState<ApiClash[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [lastRestoreNote, setLastRestoreNote] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiGet<ApiClashListResponse>(
        `/clashes?deleted=1&pageSize=${PAGE_SIZE}&sort=createdAt&dir=desc`
      );
      setRows(result.data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Gagal memuat clash terhapus.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, same pattern as reloadMasterData
    void load();
  }, [load]);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  async function handleRestore(clash: ApiClash) {
    setRestoringId(clash.id);
    setRowError(null);
    setLastRestoreNote(null);
    try {
      const restored = await apiPost<ApiClash>(`/clashes/${clash.id}/restore`);
      setRows((prev) => (prev ? prev.filter((c) => c.id !== clash.id) : prev));
      setLastRestoreNote(
        restored.uniqueCode !== clash.uniqueCode
          ? `Dipulihkan sebagai ${restored.uniqueCode} — kode lama "${clash.uniqueCode}" sudah dipakai clash lain.`
          : `Dipulihkan sebagai ${restored.uniqueCode}.`
      );
    } catch (error) {
      setRowError(error instanceof ApiError ? error.message : "Gagal memulihkan clash.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Clash Terhapus</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Clash yang dihapus (soft delete) di proyek aktif. Kodenya bisa dipakai ulang oleh clash baru di
        disiplin yang sama — kalau itu terjadi, memulihkan clash ini memberinya kode baru di ujung
        urutan, bukan kode lamanya.
      </p>

      {loadError && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>
      )}
      {rowError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}
      {lastRestoreNote && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
          {lastRestoreNote}
        </p>
      )}

      <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {rows === null ? (
          <p className="p-5 text-sm text-zinc-400">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-zinc-400">Tidak ada clash terhapus di proyek ini.</p>
        ) : (
          rows.map((clash) => {
            const domain = toClash(clash);
            const discipline = disciplineById(domain.disciplineId);
            const status = statusById(domain.statusId);
            return (
              <div key={clash.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-500">
                      {clash.uniqueCode}
                    </span>
                    {discipline && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                        {discipline.kode}
                      </span>
                    )}
                    {status && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                        {status.nama}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/clashes/${clash.id}`}
                    className="mt-1 block truncate text-sm font-medium text-zinc-800 hover:underline"
                  >
                    {clash.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-400">Dibuat {formatDateTime(clash.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRestore(clash)}
                  disabled={restoringId === clash.id}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {restoringId === clash.id ? "Memulihkan…" : "Pulihkan"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
