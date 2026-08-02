"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { PRIORITIES, PROJECT, STATUSES, USERS } from "@/lib/mock-data";
import {
  allowedStatusTransitions,
  canComment,
  canEditClash,
  disciplineById,
  formatBytes,
  formatDateTime,
  isOverdue,
  priorityById,
  statusById,
  userById,
  zoneById,
} from "@/lib/lookup";
import { PriorityBadge, StatusBadge, OverdueBadge } from "@/components/Badge";

type Tab = "lampiran" | "komentar" | "riwayat";

export default function ClashDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isLoading } = useRequireAuth();
  const { clashes, comments, auditLogs, attachments, updateClashField, addComment } = useData();
  const [tab, setTab] = useState<Tab>("lampiran");
  const [commentText, setCommentText] = useState("");

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  const clash = clashes.find((c) => c.id === id);
  if (!clash) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-zinc-500">Clash tidak ditemukan.</p>
        <Link href="/register" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          Kembali ke Register
        </Link>
      </div>
    );
  }

  const editable = canEditClash(user.peran, clash, user.id);
  const statusOptions = allowedStatusTransitions(user.peran, clash, user.id);
  const overdue = isOverdue(clash);
  const clashComments = comments
    .filter((c) => c.clashId === clash.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const clashAudit = auditLogs
    .filter((a) => a.clashId === clash.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const clashAttachments = attachments.filter((a) => a.clashId === clash.id);

  function fieldLabel(field: string) {
    return { assigneeId: "Assignee", priorityId: "Prioritas", dueDate: "Due Date", statusId: "Status" }[
      field
    ] ?? field;
  }

  function auditText(entry: (typeof auditLogs)[number]) {
    const actor = userById(entry.actorId)?.nama ?? "Sistem";
    if (entry.aksi === "created") return `${actor} membuat clash ini.`;
    return `${actor} mengubah ${fieldLabel(entry.field ?? "").toLowerCase()} dari "${entry.nilaiLama}" ke "${entry.nilaiBaru}".`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/register" className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
        ← Kembali ke Clash Register
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-500">{clash.kodeUnik}</span>
            <StatusBadge status={statusById(clash.statusId)} />
            <PriorityBadge priority={priorityById(clash.priorityId)} />
            {overdue && <OverdueBadge />}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{clash.judul}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {PROJECT.nama} · Dilaporkan oleh {userById(clash.reporterId)?.nama} pada{" "}
            {formatDateTime(clash.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-700">Deskripsi</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
              {clash.deskripsi}
            </p>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white">
            <div className="flex border-b border-zinc-200 px-2">
              {(
                [
                  ["lampiran", `Lampiran (${clashAttachments.length})`],
                  ["komentar", `Komentar (${clashComments.length})`],
                  ["riwayat", `Riwayat (${clashAudit.length})`],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    tab === key
                      ? "border-b-2 border-zinc-900 text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === "lampiran" && (
                <>
                  {clashAttachments.length === 0 ? (
                    <p className="text-sm text-zinc-400">Belum ada lampiran.</p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {clashAttachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-semibold uppercase text-zinc-500">
                            {a.tipe}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-700">{a.namaFile}</p>
                            <p className="text-xs text-zinc-400">
                              {formatBytes(a.ukuranBytes)} · diunggah oleh {userById(a.uploadedBy)?.nama}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tab === "komentar" && (
                <div className="space-y-4">
                  {clashComments.length === 0 && (
                    <p className="text-sm text-zinc-400">Belum ada komentar.</p>
                  )}
                  {clashComments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-zinc-50 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-700">
                          {userById(c.authorId)?.nama}
                        </span>
                        <span className="text-xs text-zinc-400">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-zinc-600">{c.isi}</p>
                    </div>
                  ))}

                  {canComment(user.peran) ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!commentText.trim()) return;
                        addComment(clash.id, user.id, commentText.trim());
                        setCommentText("");
                      }}
                      className="flex items-start gap-2 pt-2"
                    >
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        rows={2}
                        placeholder="Tulis komentar…"
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      >
                        Kirim
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs italic text-zinc-400">
                      Peran Management bersifat baca-saja dan tidak dapat menambah komentar.
                    </p>
                  )}
                </div>
              )}

              {tab === "riwayat" && (
                <ol className="space-y-4 border-l border-zinc-200 pl-4">
                  {clashAudit.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-zinc-400" />
                      <p className="text-sm text-zinc-700">{auditText(entry)}</p>
                      <p className="text-xs text-zinc-400">{formatDateTime(entry.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700">Detail Triase</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Disiplin</dt>
                <dd className="mt-0.5 text-zinc-700">
                  {disciplineById(clash.disciplineId)?.nama} ({disciplineById(clash.disciplineId)?.kode})
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Zona</dt>
                <dd className="mt-0.5 text-zinc-700">
                  {zoneById(clash.zoneId)?.level} · {zoneById(clash.zoneId)?.nama}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Status</dt>
                {editable && statusOptions.length > 0 ? (
                  <select
                    value={clash.statusId}
                    onChange={(e) => updateClashField(clash.id, "statusId", e.target.value, user.id)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value={clash.statusId}>{statusById(clash.statusId)?.nama} (saat ini)</option>
                    {statusOptions
                      .filter((id) => id !== clash.statusId)
                      .map((id) => (
                        <option key={id} value={id}>
                          {STATUSES.find((s) => s.id === id)?.nama}
                        </option>
                      ))}
                  </select>
                ) : (
                  <dd className="mt-1">
                    <StatusBadge status={statusById(clash.statusId)} />
                  </dd>
                )}
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Prioritas</dt>
                {editable && (user.peran === "Coordinator" || user.peran === "Admin") ? (
                  <select
                    value={clash.priorityId}
                    onChange={(e) => updateClashField(clash.id, "priorityId", e.target.value, user.id)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama}
                      </option>
                    ))}
                  </select>
                ) : (
                  <dd className="mt-1">
                    <PriorityBadge priority={priorityById(clash.priorityId)} />
                  </dd>
                )}
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Assignee</dt>
                {user.peran === "Coordinator" || user.peran === "Admin" ? (
                  <select
                    value={clash.assigneeId ?? ""}
                    onChange={(e) =>
                      updateClashField(clash.id, "assigneeId", e.target.value || null, user.id)
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">Belum ditugaskan</option>
                    {USERS.filter((u) => u.peran === "Engineer" || u.peran === "Coordinator").map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nama}
                      </option>
                    ))}
                  </select>
                ) : (
                  <dd className="mt-0.5 text-zinc-700">
                    {userById(clash.assigneeId)?.nama ?? "Belum ditugaskan"}
                  </dd>
                )}
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Due Date</dt>
                {editable && (user.peran === "Coordinator" || user.peran === "Admin") ? (
                  <input
                    type="date"
                    value={clash.dueDate ? clash.dueDate.slice(0, 10) : ""}
                    onChange={(e) =>
                      updateClashField(
                        clash.id,
                        "dueDate",
                        e.target.value ? new Date(e.target.value).toISOString() : null,
                        user.id
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <dd className={`mt-0.5 ${overdue ? "font-semibold text-red-600" : "text-zinc-700"}`}>
                    {clash.dueDate ? formatDateTime(clash.dueDate).split(",")[0] : "-"}
                  </dd>
                )}
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Reporter</dt>
                <dd className="mt-0.5 text-zinc-700">{userById(clash.reporterId)?.nama}</dd>
              </div>

              {clash.closedAt && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Ditutup pada</dt>
                  <dd className="mt-0.5 text-zinc-700">{formatDateTime(clash.closedAt)}</dd>
                </div>
              )}
            </dl>
            {!editable && (
              <p className="mt-4 text-xs italic text-zinc-400">
                Anda memiliki akses baca-saja untuk item ini.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
