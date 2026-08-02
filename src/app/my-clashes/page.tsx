"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useMasterDataLookups } from "@/lib/use-master-data";
import { formatDate } from "@/lib/lookup";
import { apiGet } from "@/lib/api/client";
import { toClash } from "@/lib/api/mappers";
import type { ApiClashListResponse } from "@/lib/api/types";
import type { Clash } from "@/lib/types";
import { PriorityBadge, StatusBadge, OverdueBadge } from "@/components/Badge";

type Scope = "reported" | "assigned";

// Not a stated NFR target for this page (unlike Register/Dashboard) — a flat
// cap this generous is a pragmatic bound, not a real pagination UI.
const MY_CLASHES_PAGE_SIZE = 500;

export default function MyClashesPage() {
  const { user, isLoading } = useRequireAuth();
  const { disciplineById, zoneById, statusById, priorityById, isOverdue } = useMasterDataLookups();
  const [scope, setScope] = useState<Scope>("reported");
  const [list, setList] = useState<Clash[]>([]);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // setListLoading is deferred a tick so it isn't a synchronous setState
    // call in the effect body (react-hooks/set-state-in-effect) — same
    // pattern RegisterView/DashboardView use for their fetch effects.
    const timeout = setTimeout(() => {
      setListLoading(true);
      const params = new URLSearchParams({
        sort: "createdAt",
        dir: "desc",
        pageSize: String(MY_CLASHES_PAGE_SIZE),
      });
      if (scope === "reported") params.set("reporterId", user.id);
      else params.set("assignee", user.id);

      apiGet<ApiClashListResponse>(`/clashes?${params.toString()}`)
        .then((res) => {
          if (cancelled) return;
          setList(res.data.map(toClash));
        })
        .finally(() => {
          if (!cancelled) setListLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [scope, user]);

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
        {listLoading ? (
          <p className="p-8 text-center text-sm text-zinc-400">Memuat…</p>
        ) : list.length === 0 ? (
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
