"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { DISCIPLINES, PRIORITIES, ZONES } from "@/lib/mock-data";
import { formatBytes } from "@/lib/lookup";

const MAX_FILE_MB = 10;
const MAX_FILES = 10;
const ACCEPTED_TYPES = ["image/", "application/pdf"];

const clashSchema = z.object({
  judul: z.string().min(5, "Judul minimal 5 karakter").max(150, "Judul maksimal 150 karakter"),
  disciplineId: z.string().min(1, "Disiplin wajib dipilih"),
  zoneId: z.string().min(1, "Lokasi/zona wajib dipilih"),
  priorityId: z.string().min(1, "Prioritas wajib dipilih"),
  deskripsi: z.string().min(10, "Deskripsi minimal 10 karakter"),
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof clashSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

interface PendingFile {
  file: File;
  error?: string;
}

export default function NewClashPage() {
  const { user, isLoading } = useRequireAuth();
  const { createClash } = useData();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<FormValues>({
    judul: "",
    disciplineId: "",
    zoneId: "",
    priorityId: "",
    deskripsi: "",
    dueDate: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitted, setSubmitted] = useState<{ kodeUnik: string; id: string } | null>(null);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  if (user.peran === "Management") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Peran Management bersifat baca-saja dan tidak dapat membuat clash baru.
        </p>
      </div>
    );
  }

  const reporterId = user.id;

  function validateFile(file: File): string | undefined {
    const typeOk = ACCEPTED_TYPES.some((t) => file.type.startsWith(t));
    if (!typeOk) return "Tipe file harus gambar atau PDF";
    if (file.size > MAX_FILE_MB * 1024 * 1024) return `Ukuran melebihi ${MAX_FILE_MB} MB`;
    return undefined;
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    setFiles((prev) => {
      const combined = [...prev];
      for (const file of incoming) {
        if (combined.length >= MAX_FILES) break;
        combined.push({ file, error: validateFile(file) });
      }
      return combined;
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = clashSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof FormValues] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (files.some((f) => f.error)) {
      setErrors((prev) => ({ ...prev, judul: prev.judul }));
      return;
    }
    setErrors({});

    const clash = createClash(
      {
        judul: result.data.judul,
        disciplineId: result.data.disciplineId,
        zoneId: result.data.zoneId,
        priorityId: result.data.priorityId,
        deskripsi: result.data.deskripsi,
        dueDate: result.data.dueDate || undefined,
        attachments: files.map((f) => ({
          namaFile: f.file.name,
          tipe: f.file.type === "application/pdf" ? "pdf" : "image",
          ukuranBytes: f.file.size,
        })),
      },
      reporterId
    );
    setSubmitted({ kodeUnik: clash.kodeUnik, id: clash.id });
  }

  const hasFileErrors = files.some((f) => f.error);

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          ✓
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">Clash berhasil dibuat</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Item baru dengan kode <span className="font-mono font-semibold">{submitted.kodeUnik}</span>{" "}
          telah masuk ke Clash Register dengan status <span className="font-medium">Open</span>.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => router.push(`/clashes/${submitted.id}`)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Lihat Detail
          </button>
          <button
            onClick={() => {
              setSubmitted(null);
              setValues({ judul: "", disciplineId: "", zoneId: "", priorityId: "", deskripsi: "", dueDate: "" });
              setFiles([]);
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Input Clash Lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Input Clash / Issue Baru</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Lengkapi form berikut. Field bertanda * wajib diisi.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-2xl border border-zinc-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Judul *</label>
          <input
            value={values.judul}
            onChange={(e) => setValues((v) => ({ ...v, judul: e.target.value }))}
            placeholder="Ringkas & jelas, mis. Bentrok pipa HVAC dengan balok struktur"
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.judul ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.judul && <p className="mt-1 text-xs text-red-600">{errors.judul}</p>}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Disiplin *</label>
            <select
              value={values.disciplineId}
              onChange={(e) => setValues((v) => ({ ...v, disciplineId: e.target.value }))}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.disciplineId ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
              }`}
            >
              <option value="">Pilih disiplin</option>
              {DISCIPLINES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.kode} — {d.nama}
                </option>
              ))}
            </select>
            {errors.disciplineId && <p className="mt-1 text-xs text-red-600">{errors.disciplineId}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Lokasi / Zona *</label>
            <select
              value={values.zoneId}
              onChange={(e) => setValues((v) => ({ ...v, zoneId: e.target.value }))}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.zoneId ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
              }`}
            >
              <option value="">Pilih zona</option>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.level} · {z.nama}
                </option>
              ))}
            </select>
            {errors.zoneId && <p className="mt-1 text-xs text-red-600">{errors.zoneId}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Prioritas *</label>
            <select
              value={values.priorityId}
              onChange={(e) => setValues((v) => ({ ...v, priorityId: e.target.value }))}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.priorityId ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
              }`}
            >
              <option value="">Pilih prioritas</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
            {errors.priorityId && <p className="mt-1 text-xs text-red-600">{errors.priorityId}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Due Date (opsional)</label>
          <input
            type="date"
            value={values.dueDate}
            onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
            className="w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Deskripsi *</label>
          <textarea
            value={values.deskripsi}
            onChange={(e) => setValues((v) => ({ ...v, deskripsi: e.target.value }))}
            rows={4}
            placeholder="Jelaskan konteks bentrok/issue, elemen yang terlibat, dan dampaknya"
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.deskripsi ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.deskripsi && <p className="mt-1 text-xs text-red-600">{errors.deskripsi}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Lampiran (gambar/PDF, maks {MAX_FILE_MB} MB per file)
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              isDragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400"
            }`}
          >
            <p className="text-sm font-medium text-zinc-600">
              Seret &amp; lepas file di sini, atau klik untuk memilih
            </p>
            <p className="mt-1 text-xs text-zinc-400">Gambar atau PDF, maksimal {MAX_FILES} file</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, idx) => (
                <li
                  key={`${f.file.name}-${idx}`}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    f.error ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-700">{f.file.name}</p>
                    <p className={`text-xs ${f.error ? "text-red-600" : "text-zinc-400"}`}>
                      {f.error ?? formatBytes(f.file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="ml-3 text-xs font-medium text-zinc-500 hover:text-red-600"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasFileErrors && (
            <p className="mt-2 text-xs text-red-600">
              Perbaiki atau hapus file bermasalah sebelum submit.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-100 pt-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={hasFileErrors}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            Submit Clash
          </button>
        </div>
      </form>
    </div>
  );
}
