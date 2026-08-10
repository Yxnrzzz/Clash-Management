"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { useMasterDataLookups } from "@/lib/use-master-data";
import { apiGet } from "@/lib/api/client";
import { canDeleteClash, canEditClash, formatDateTime, isAssignable } from "@/lib/lookup";
import { PriorityBadge, StatusBadge, OverdueBadge } from "@/components/Badge";
import { DeleteClashDialog } from "@/components/clashes/DeleteClashDialog";
import { AttachmentPanel } from "@/components/clashes/AttachmentPanel";
import { AttachmentPreviewModal } from "@/components/clashes/AttachmentPreviewModal";

type Tab = "lampiran" | "komentar" | "riwayat";

export default function ClashDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading } = useRequireAuth();
  const {
    clashesById,
    comments,
    auditLogs,
    attachments,
    project,
    users,
    updateClashField,
    addComment,
    loadClashDetail,
    deleteClash,
    uploadAttachments,
    deleteAttachment,
  } = useData();
  const { priorities, disciplineById, zoneById, statusById, priorityById, userById, isOverdue, allowedStatusTransitions } =
    useMasterDataLookups();
  const assignableUsers = users.filter(isAssignable);
  const [tab, setTab] = useState<Tab>("lampiran");
  const [commentText, setCommentText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Comments, audit log, and attachments are loaded lazily per clash — the
  // Register never needs them, only this detail page does.
  useEffect(() => {
    void loadClashDetail(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadClashDetail is stable; only re-run when the route id changes
  }, [id]);

  // Fetches a short-lived signed URL for each attachment not already
  // fetched, and uses it directly as the <img>/<a> src — no auth headers
  // needed for the browser to load it, and no blob object URL (or its
  // matching revoke-on-unmount) to manage. Re-fetches on every mount, same
  // as the old blob-fetch approach, so previews survive a reload (see
  // HANDOFF.md §5); each url expires 5 minutes after being issued.
  useEffect(() => {
    const missing = attachments.filter(
      (a) => a.clashId === id && !previewUrlsRef.current[a.id]
    );
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (a) => {
        try {
          const { url } = await apiGet<{ url: string }>(
            `/clashes/${id}/attachments/${a.id}/signed-url`
          );
          return [a.id, `/api${url}`] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const next = { ...previewUrlsRef.current };
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      previewUrlsRef.current = next;
      setPreviewUrls(next);
    });

    return () => {
      cancelled = true;
    };
  }, [attachments, id]);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  const clash = clashesById[id];
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
  const clashId = clash.id;
  const userId = user.id;

  async function handleFieldChange(
    field: "statusId" | "priorityId" | "assigneeId" | "dueDate",
    value: string | null
  ) {
    setActionError(null);
    try {
      await updateClashField(clashId, field, value, userId);
    } catch {
      setActionError("Gagal menyimpan perubahan. Periksa koneksi dan coba lagi.");
    }
  }

  async function handleAddComment(text: string) {
    setActionError(null);
    try {
      await addComment(clashId, userId, text);
      setCommentText("");
    } catch {
      setActionError("Gagal mengirim komentar. Periksa koneksi dan coba lagi.");
    }
  }

  async function handleDeleteClash() {
    setActionError(null);
    try {
      await deleteClash(clashId);
      router.push("/register");
    } catch {
      setActionError("Gagal menghapus clash. Periksa koneksi dan coba lagi.");
      setConfirmingDelete(false);
    }
  }

  async function handleUploadAttachments(files: File[]) {
    setActionError(null);
    try {
      await uploadAttachments(clashId, files);
    } catch {
      setActionError("Gagal mengunggah lampiran. Periksa koneksi dan coba lagi.");
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    setActionError(null);
    try {
      await deleteAttachment(clashId, attachmentId);
    } catch {
      setActionError("Gagal menghapus lampiran. Periksa koneksi dan coba lagi.");
    }
  }

  function fieldLabel(field: string) {
    return {
      assigneeId: "Assignee",
      priorityId: "Prioritas",
      dueDate: "Due Date",
      statusId: "Status",
      uniqueCode: "Kode Unik",
    }[field] ?? field;
  }

  function auditText(entry: (typeof auditLogs)[number]) {
    const actor = userById(entry.actorId)?.nama ?? "Sistem";
    if (entry.aksi === "created") return `${actor} membuat clash ini.`;
    if (entry.aksi === "imported") return `${actor} membuat clash ini lewat impor massal.`;
    if (entry.aksi === "deleted") return `${actor} menghapus clash ini.`;
    if (entry.aksi === "restored") return `${actor} memulihkan clash ini.`;
    if (entry.aksi === "attachment_added") return `${actor} menambahkan lampiran "${entry.nilaiBaru}".`;
    if (entry.aksi === "attachment_deleted") return `${actor} menghapus lampiran "${entry.nilaiLama}".`;
    if (entry.aksi === "code_changed") {
      return `Kode clash berubah dari "${entry.nilaiLama}" ke "${entry.nilaiBaru}" karena kode proyek atau disiplin diganti.`;
    }
    if (entry.aksi === "code_reassigned") {
      return `${actor} memulihkan clash ini, tapi kode lamanya "${entry.nilaiLama}" sudah dipakai clash lain — kode baru "${entry.nilaiBaru}" diberikan.`;
    }
    if (!entry.field) return `${actor} melakukan aksi "${entry.aksi}".`;
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
            {project.nama} · Dilaporkan oleh {userById(clash.reporterId)?.nama} pada{" "}
            {formatDateTime(clash.createdAt)}
          </p>
        </div>
      </div>

      {actionError && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>
      )}

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
                <AttachmentPanel
                  attachments={clashAttachments}
                  previewUrls={previewUrls}
                  userById={userById}
                  userRole={user.peran}
                  userId={user.id}
                  onUpload={handleUploadAttachments}
                  onDelete={handleDeleteAttachment}
                  onPreview={(attachmentId) =>
                    setPreviewIndex(clashAttachments.findIndex((a) => a.id === attachmentId))
                  }
                />
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

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!commentText.trim()) return;
                      void handleAddComment(commentText.trim());
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
                    onChange={(e) => void handleFieldChange("statusId", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value={clash.statusId}>{statusById(clash.statusId)?.nama} (saat ini)</option>
                    {statusOptions
                      .filter((id) => id !== clash.statusId)
                      .map((id) => (
                        <option key={id} value={id}>
                          {statusById(id)?.nama}
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
                    onChange={(e) => void handleFieldChange("priorityId", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {priorities.filter((p) => p.isActive).map((p) => (
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
                    onChange={(e) => void handleFieldChange("assigneeId", e.target.value || null)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">Belum ditugaskan</option>
                    {assignableUsers.map((u) => (
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
                      void handleFieldChange(
                        "dueDate",
                        e.target.value ? new Date(e.target.value).toISOString() : null
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

          {canDeleteClash(user.peran) && (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-sm font-semibold text-red-700">Zona berbahaya</h2>
              <p className="mt-2 text-sm text-red-600">
                Clash akan disembunyikan dari Register, Dashboard, dan Clash Saya. Data tetap
                tersimpan dan dapat dipulihkan.
              </p>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Hapus clash
              </button>
            </section>
          )}
        </aside>
      </div>

      {confirmingDelete && (
        <DeleteClashDialog
          kodeUnik={clash.kodeUnik}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDeleteClash}
        />
      )}

      {previewIndex !== null && clashAttachments[previewIndex] && (
        <AttachmentPreviewModal
          clashId={clashId}
          attachments={clashAttachments}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          userById={userById}
          currentUser={{ id: user.id, peran: user.peran }}
        />
      )}
    </div>
  );
}
