"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/use-require-auth";
import { commitImport, getImportJob, previewImport } from "@/lib/api/import";
import { ApiError } from "@/lib/api/client";
import type { ApiImportJob, ApiImportMapping, ApiImportPreview } from "@/lib/api/types";

type Step = "upload" | "mapping" | "preview";

type MappingField = keyof ApiImportMapping;

const EMPTY_MAPPING: ApiImportMapping = {
  title: "",
  disciplineCode: "",
  zoneName: "",
  priorityName: "",
  description: "",
  dueDate: "",
  externalId: "",
};

const REQUIRED_FIELDS: MappingField[] = ["title", "disciplineCode", "zoneName", "priorityName", "description"];

const FIELD_LABELS: Record<MappingField, string> = {
  title: "Judul *",
  disciplineCode: "Disiplin (kode/nama) *",
  zoneName: "Zona *",
  priorityName: "Prioritas *",
  description: "Deskripsi *",
  dueDate: "Due Date (opsional)",
  externalId: "External ID (opsional, untuk cegah duplikat)",
};

const POLL_INTERVAL_MS = 1000;

const SAMPLE_CSV = `judul,disiplin,zona,prioritas,deskripsi,due_date,external_id
Bentrok pipa AC dengan balok,MEP,Lantai 2 Zona A,High,Ditemukan saat koordinasi model minggu ini,2026-09-10,NW-00231
Dinding partisi menutup shaft,ARS,Lantai 1 Zona B,Medium,Perlu revisi shop drawing arsitektur,,NW-00245`;

const SAMPLE_XML = `<exchange>
  <batchtest>
    <clashtests>
      <clashtest>
        <clashresults>
          <clashresult name="Bentrok pipa AC dengan balok" discipline="MEP" zone="Lantai 2 Zona A" priority="High" description="Ditemukan saat koordinasi model minggu ini" duedate="2026-09-10" externalid="NW-00231"/>
          <clashresult name="Dinding partisi menutup shaft" discipline="ARS" zone="Lantai 1 Zona B" priority="Medium" description="Perlu revisi shop drawing arsitektur" externalid="NW-00245"/>
        </clashresults>
      </clashtest>
    </clashtests>
  </batchtest>
</exchange>`;

function downloadText(text: string, fileName: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const { user, isLoading } = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step, setStep] = useState<Step>("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApiImportPreview | null>(null);
  const [mapping, setMapping] = useState<ApiImportMapping>(EMPTY_MAPPING);
  const [autoCreateMasterData, setAutoCreateMasterData] = useState(false);

  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [job, setJob] = useState<ApiImportJob | null>(null);

  // Stop polling on unmount or when a new job replaces the tracked one.
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  if (user.peran !== "Coordinator" && user.peran !== "Admin") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Hanya Coordinator dan Admin yang dapat mengimpor clash secara massal.
        </p>
      </div>
    );
  }

  // Captured as a plain boolean (rather than reading user.peran inside the
  // closures below) so TS keeps it narrowed — closures don't retain the
  // non-null narrowing performed by the early returns above.
  const isAdmin = user.peran === "Admin";

  async function handleFile(file: File) {
    setFileError(null);
    setIsUploading(true);
    try {
      const result = await previewImport(file);
      setPreview(result);
      setMapping({ ...EMPTY_MAPPING, ...result.suggestedMapping });
      setStep("mapping");
    } catch (error) {
      setFileError(
        error instanceof ApiError ? error.message : "Gagal membaca file. Pastikan file CSV atau XML valid.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  function pollJob(jobId: string) {
    getImportJob(jobId)
      .then((result) => {
        setJob(result);
        if (result.status === "DONE" || result.status === "FAILED") return;
        pollTimeoutRef.current = setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
      })
      .catch(() => {
        setCommitError("Gagal memuat status impor. Refresh halaman untuk mencoba lagi.");
      });
  }

  async function handleCommit() {
    if (!preview) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      const { jobId } = await commitImport({
        token: preview.token,
        fileName: preview.fileName,
        mapping,
        autoCreateMasterData: isAdmin ? autoCreateMasterData : undefined,
      });
      pollJob(jobId);
    } catch (error) {
      setCommitError(error instanceof ApiError ? error.message : "Gagal memulai proses impor.");
      setIsCommitting(false);
    }
  }

  const mappingComplete = REQUIRED_FIELDS.every((f) => mapping[f]);
  const isJobFinished = job?.status === "DONE" || job?.status === "FAILED";
  const progressPercent = job && job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Import Clash dari CSV/XML</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Upload → petakan kolom → pratinjau &amp; commit. File diproses di server sebagai job async, jadi
        aman untuk file besar. Mendukung CSV dan hasil export XML Navisworks/Solibri.
      </p>

      <div className="mt-4 flex items-center gap-2 text-xs font-medium text-zinc-400">
        <span className={step === "upload" ? "text-zinc-900" : ""}>1. Upload</span>
        <span>→</span>
        <span className={step === "mapping" ? "text-zinc-900" : ""}>2. Mapping</span>
        <span>→</span>
        <span className={step === "preview" ? "text-zinc-900" : ""}>3. Preview &amp; Commit</span>
      </div>

      {step === "upload" && (
        <div className="mt-6 space-y-4">
          {fileError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{fileError}</p>}
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 px-6 py-10 text-center hover:border-zinc-400"
          >
            <p className="text-sm font-medium text-zinc-600">
              {isUploading ? "Mengunggah…" : "Klik untuk memilih file CSV atau XML"}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              CSV: baris pertama harus berisi nama kolom. XML: export Navisworks atau Solibri.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xml,text/csv,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium text-zinc-600">Contoh format CSV:</p>
              <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{SAMPLE_CSV}</pre>
              <button
                onClick={() => downloadText(SAMPLE_CSV, "contoh-import-eps-workspace.csv", "text/csv")}
                className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                Unduh contoh CSV ini
              </button>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium text-zinc-600">Contoh format XML (Navisworks):</p>
              <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{SAMPLE_XML}</pre>
              <button
                onClick={() => downloadText(SAMPLE_XML, "contoh-import-eps-workspace.xml", "application/xml")}
                className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                Unduh contoh XML ini
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "mapping" && preview && (
        <div className="mt-6">
          <p className="mb-4 text-sm text-zinc-600">
            <span className="font-medium">{preview.fileName}</span> ({preview.format.toUpperCase()}) —{" "}
            {preview.totalRows} baris terdeteksi, kolom: {preview.columns.join(", ")}
          </p>
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
            {(Object.keys(FIELD_LABELS) as MappingField[]).map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-zinc-600">{FIELD_LABELS[field]}</label>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
                >
                  <option value="">-- pilih kolom --</option>
                  {preview.columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {isAdmin && (
            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={autoCreateMasterData}
                onChange={(e) => setAutoCreateMasterData(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300"
              />
              <span>
                <span className="font-medium text-zinc-800">Buat master data yang belum ada.</span> Disiplin,
                zona, atau prioritas dari file yang tidak ditemukan di sistem akan dibuat otomatis alih-alih
                membuat baris tersebut gagal. Hanya tersedia untuk Admin.
              </span>
            </label>
          )}

          <div className="mt-5 flex justify-between">
            <button
              onClick={() => setStep("upload")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Kembali
            </button>
            <button
              onClick={() => setStep("preview")}
              disabled={!mappingComplete}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              Lanjut ke Preview
            </button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="mt-6">
          {job ? (
            <div
              className={`rounded-2xl border p-6 text-center ${
                !isJobFinished
                  ? "border-zinc-200 bg-white"
                  : job.status === "FAILED" || job.failedRows > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
              }`}
            >
              {!isJobFinished ? (
                <>
                  <p className="text-sm font-semibold text-zinc-800">
                    Memproses {job.processedRows}/{job.totalRows} baris…
                  </p>
                  <div className="mx-auto mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </>
              ) : job.status === "FAILED" ? (
                <p className="text-sm font-semibold text-amber-800">
                  Job impor gagal: {job.errors[0]?.reason ?? "Terjadi kesalahan tak terduga."}
                </p>
              ) : (
                <>
                  <p
                    className={`text-sm font-semibold ${
                      job.failedRows > 0 ? "text-amber-800" : "text-emerald-800"
                    }`}
                  >
                    Import selesai: {job.succeededRows} clash berhasil dibuat
                    {job.skippedRows > 0 && `, ${job.skippedRows} baris dilewati (duplikat external ID)`}
                    {job.failedRows > 0 && `, ${job.failedRows} baris gagal divalidasi`}.
                  </p>
                  {job.errors.length > 0 && (
                    <ul className="mx-auto mt-3 max-h-64 max-w-md space-y-1 overflow-y-auto text-left text-xs text-amber-700">
                      {job.errors.map((err) => (
                        <li key={err.rowNumber}>
                          • Baris {err.rowNumber}: {err.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href="/register"
                    className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Lihat di Register
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              {commitError && (
                <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{commitError}</p>
              )}
              <p className="mb-4 text-sm text-zinc-600">
                {preview.totalRows} baris akan dikirim ke server untuk divalidasi dan diimpor. Berikut
                contoh {preview.sampleRows.length} baris pertama sesuai mapping saat ini:
              </p>
              <div className="max-h-96 overflow-y-auto rounded-2xl border border-zinc-200 bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-2">Baris</th>
                      <th className="px-4 py-2">Judul</th>
                      <th className="px-4 py-2">Disiplin</th>
                      <th className="px-4 py-2">Zona</th>
                      <th className="px-4 py-2">Prioritas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.map((row, idx) => {
                      const get = (field: MappingField) => {
                        const col = mapping[field];
                        const colIdx = col ? preview.columns.indexOf(col) : -1;
                        return colIdx >= 0 ? row[colIdx] ?? "-" : "-";
                      };
                      return (
                        <tr key={idx} className="border-b border-zinc-100 last:border-0">
                          <td className="px-4 py-2 text-zinc-500">{idx + 2}</td>
                          <td className="px-4 py-2 text-zinc-700">{get("title")}</td>
                          <td className="px-4 py-2 text-zinc-700">{get("disciplineCode")}</td>
                          <td className="px-4 py-2 text-zinc-700">{get("zoneName")}</td>
                          <td className="px-4 py-2 text-zinc-700">{get("priorityName")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => setStep("mapping")}
                  disabled={isCommitting}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Kembali ke Mapping
                </button>
                <button
                  onClick={handleCommit}
                  disabled={isCommitting}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  {isCommitting ? "Memulai…" : `Commit ${preview.totalRows} Baris`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
