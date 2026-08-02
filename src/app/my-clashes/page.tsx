"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { useMasterDataLookups } from "@/lib/use-master-data";
import { formatDate } from "@/lib/lookup";
import { PriorityBadge, StatusBadge, OverdueBadge } from "@/components/Badge";

type Scope = "reported" | "assigned";

export default function MyClashesPage() {
  const { user, isLoading } = useRequireAuth();
  const { clashes } = useData();
  const { disciplineById, zoneById, statusById, priorityById, isOverdue } = useMasterDataLookups();
  const [scope, setScope] = useState<Scope>("reported");

  const list = useMemo(() => {
    if (!user) return [];
    const filtered = clashes.filter((c) =>
      scope === "reported" ? c.reporterId === user.id : c.assigneeId === user.id
    );
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [clashes, scope, user]);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Clash Saya</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Pantau item yang Anda laporkan atau yang ditugaskan kepada Anda.
      </p>

      <div className="mt-6 flex gap-2 border-b border-zinc-200">
        {(
          [
            ["reported", "Dilaporkan saya"],
            ["assigned", "Ditugaskan ke saya"],
          ] as [Scope, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScope(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              scope === key
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-400">
            Tidak ada clash pada kategori ini.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Judul</th>
                <th className="px-4 py-3">Disiplin / Zona</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Prioritas</th>
                <th className="px-4 py-3">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/clashes/${c.id}`} className="font-mono text-xs font-semibold hover:underline">
                      {c.kodeUnik}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/clashes/${c.id}`} className="text-sm text-zinc-800 hover:underline">
                      {c.judul}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-500">
                    {disciplineById(c.disciplineId)?.kode} · {zoneById(c.zoneId)?.level}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={statusById(c.statusId)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <PriorityBadge priority={priorityById(c.priorityId)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isOverdue(c) ? "font-semibold text-red-600" : "text-zinc-600"}`}>
                        {formatDate(c.dueDate)}
                      </span>
                      {isOverdue(c) && <OverdueBadge />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
