"use client";

import { useRef, useState } from "react";
import type { Attachment, AttachmentRole, Role, User } from "@/lib/types";
import {
  ATTACHMENT_ROLE_LABEL,
  canDeleteAttachment,
  canManageAttachment,
  canUploadAttachment,
  formatBytes,
} from "@/lib/lookup";
import { MAX_FILES, MAX_FILE_MB, validateAttachmentFile } from "@/lib/attachments";

const ROLE_OPTIONS: AttachmentRole[] = ["OTHER", "ORIGINAL", "CLASH_DETECTION"];

export function AttachmentPanel({
  attachments,
  previewUrls,
  userById,
  userRole,
  userId,
  onUpload,
  onDelete,
  onPreview,
  onRoleChange,
}: {
  attachments: Attachment[];
  previewUrls: Record<string, string>;
  userById: (id: string) => User | undefined;
  userRole: Role;
  userId: string;
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (attachmentId: string) => Promise<void>;
  onPreview?: (attachmentId: string) => void;
  /** Absent = the role picker is hidden entirely (e.g. a read-only view). */
  onRoleChange?: (attachmentId: string, role: AttachmentRole) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingErrors, setPendingErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  async function handleRoleChange(attachmentId: string, role: AttachmentRole) {
    if (!onRoleChange) return;
    setSavingRoleId(attachmentId);
    try {
      await onRoleChange(attachmentId, role);
    } finally {
      setSavingRoleId(null);
    }
  }

  const canUpload = canUploadAttachment(userRole);

  async function handleFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).slice(0, MAX_FILES);
    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of incoming) {
      const error = validateAttachmentFile(file);
      if (error) errors.push(`${file.name}: ${error}`);
      else valid.push(file);
    }
    setPendingErrors(errors);
    if (valid.length === 0) return;

    setUploading(true);
    try {
      await onUpload(valid);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmDelete(attachmentId: string) {
    setDeletingId(attachmentId);
    try {
      await onDelete(attachmentId);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const confirmTarget = attachments.find((a) => a.id === confirmDeleteId);

  return (
    <div>
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
            isDragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400"
          }`}
        >
          <p className="text-sm font-medium text-zinc-600">
            {uploading ? "Mengunggah…" : "Seret & lepas file di sini, atau klik untuk memilih"}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Gambar atau PDF, maks {MAX_FILE_MB} MB, maksimal {MAX_FILES} file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {pendingErrors.length > 0 && (
        <ul className="mb-4 space-y-1 text-xs text-red-600">
          {pendingErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-zinc-400">Belum ada lampiran.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {attachments.map((a) => {
            const previewUrl = previewUrls[a.id];
            const canDelete = canDeleteAttachment(userRole, a.uploadedBy, userId);
            return (
              // Kolom, bukan baris: picker peran butuh lebarnya sendiri.
              // Ditaruh sebaris dengan nama file dan tombol aksi, teksnya
              // terpotong jadi "Ori…" / "Clas…" di kartu grid dua kolom.
              <li key={a.id} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center gap-3">
                {previewUrl && a.tipe === "image" ? (
                  <button
                    type="button"
                    onClick={() => onPreview?.(a.id)}
                    aria-label={`Pratinjau ${a.namaFile}`}
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring API URL; next/image's optimizer would need a stable public URL */}
                    <img
                      src={previewUrl}
                      alt={a.namaFile}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPreview?.(a.id)}
                    aria-label={`Pratinjau ${a.namaFile}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-semibold uppercase text-zinc-500"
                  >
                    {a.tipe}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-700">{a.namaFile}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {formatBytes(a.ukuranBytes)} · diunggah oleh {userById(a.uploadedBy)?.nama}
                  </p>
                </div>
                {previewUrl && (
                  <a
                    href={previewUrl}
                    download={a.namaFile}
                    className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
                  >
                    Unduh
                  </a>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(a.id)}
                    disabled={deletingId === a.id}
                    className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40"
                  >
                    Hapus
                  </button>
                )}
                </div>

                {onRoleChange &&
                  (canManageAttachment(userRole, a.uploadedBy, userId) ? (
                    <label className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-xs text-zinc-400">Kolom laporan</span>
                      <select
                        aria-label={`Peran laporan untuk ${a.namaFile}`}
                        value={a.role}
                        disabled={savingRoleId === a.id}
                        onChange={(e) =>
                          void handleRoleChange(a.id, e.target.value as AttachmentRole)
                        }
                        className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {ATTACHMENT_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    a.role !== "OTHER" && (
                      <span className="mt-2 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                        {ATTACHMENT_ROLE_LABEL[a.role]}
                      </span>
                    )
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-zinc-900 shadow-lg">
            <h2 className="text-base font-semibold">Hapus lampiran</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Lampiran <strong>{confirmTarget.namaFile}</strong> akan dihapus permanen dan tidak
              dapat dipulihkan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === confirmTarget.id}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete(confirmTarget.id)}
                disabled={deletingId === confirmTarget.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === confirmTarget.id ? "Menghapus…" : "Ya, hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
