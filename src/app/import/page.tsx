"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { parseCsv } from "@/lib/csv";

type Step = "upload" | "mapping" | "preview";

interface Mapping {
  judul: string;
  disciplineKode: string;
  zoneLabel: string;
  priorityNama: string;
  deskripsi: string;
  dueDate: string;
}

const EMPTY_MAPPING: Mapping = {
  judul: "",
  disciplineKode: "",
  zoneLabel: "",
  priorityNama: "",
  deskripsi: "",
  dueDate: "",
};

const REQUIRED_FIELDS: (keyof Mapping)[] = ["judul", "disciplineKode", "zoneLabel", "priorityNama", "deskripsi"];

const FIELD_LABELS: Record<keyof Mapping, string> = {
  judul: "Judul *",
  disciplineKode: "Disiplin (kode) *",
  zoneLabel: "Zona *",
  priorityNama: "Prioritas *",
  deskripsi: "Deskripsi *",
  dueDate: "Due Date (opsional)",
};

interface RowResult {
  rowNumber: number;
  ok: boolean;
  reason?: string;
  data?: {
    judul: string;
    disciplineId: string;
    zoneId: string;
    priorityId: string;
    deskripsi: string;
    dueDate?: string;
  };
}

const SAMPLE_CSV = `judul,disiplin,zona,prioritas,deskripsi,due_date
Bentrok pipa AC dengan balok,MEP,Lantai 2 Zona A,High,Ditemukan saat koordinasi model minggu ini,2026-09-10
Dinding partisi menutup shaft,ARS,Lantai 1 Zona B,Medium,Perlu revisi shop drawing arsitektur,`;

export default function ImportPage() {
  const { user, isLoading } = useRequireAuth();
  const { disciplines, zones, priorities, createClash } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [commitSummary, setCommitSummary] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

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

  const importerId = user.id;

  function handleFile(file: File) {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { headers: h, rows: r } = parseCsv(String(reader.result));
      setHeaders(h);
      setRows(r);
      setFileName(file.name);

      // Best-effort auto-map by header name — user can still override.
      const guess = (needle: string) =>
        h.find((col) => col.toLowerCase().replace(/[^a-z]/g, "").includes(needle)) ?? "";
      setMapping({
        judul: guess("judul") || guess("title"),
        disciplineKode: guess("disiplin") || guess("discipline"),
        zoneLabel: guess("zona") || guess("zone"),
        priorityNama: guess("prioritas") || guess("priority"),
        deskripsi: guess("deskripsi") || guess("description"),
        dueDate: guess("duedate") || guess("tanggal"),
      });
      setStep("mapping");
    };
    reader.onerror = () => {
      setFileError("Gagal membaca file. Pastikan file berupa CSV yang valid dan coba lagi.");
    };
    reader.readAsText(file);
  }

  function runValidation(): RowResult[] {
    const colIndex = (col: string) => headers.indexOf(col);
    return rows.map((row, idx) => {
      const rowNumber = idx + 2; // +1 for header, +1 for 1-index
      const get = (field: keyof Mapping) => {
        const i = colIndex(mapping[field]);
        return i >= 0 ? row[i] ?? "" : "";
      };

      const judul = get("judul");
      const disciplineRaw = get("disciplineKode");
      const zoneRaw = get("zoneLabel");
      const priorityRaw = get("priorityNama");
      const deskripsi = get("deskripsi");
      const dueDateRaw = mapping.dueDate ? get("dueDate") : "";

      if (!judul) return { rowNumber, ok: false, reason: "Judul kosong" };
      if (!deskripsi) return { rowNumber, ok: false, reason: "Deskripsi kosong" };

      const discipline = disciplines.find(
        (d) => d.kode.toLowerCase() === disciplineRaw.trim().toLowerCase() && d.isActive
      );
      if (!discipline) return { rowNumber, ok: false, reason: `Disiplin "${disciplineRaw}" tidak dikenali/nonaktif` };

      const zoneNeedle = zoneRaw.trim().toLowerCase();
      const zone = zones.find(
        (z) => z.isActive && `${z.level} ${z.nama}`.toLowerCase().includes(zoneNeedle)
      );
      if (!zone) return { rowNumber, ok: false, reason: `Zona "${zoneRaw}" tidak dikenali/nonaktif` };

      const priority = priorities.find(
        (p) => p.nama.toLowerCase() === priorityRaw.trim().toLowerCase() && p.isActive
      );
      if (!priority) return { rowNumber, ok: false, reason: `Prioritas "${priorityRaw}" tidak dikenali/nonaktif` };

      let dueDate: string | undefined;
      if (dueDateRaw) {
        const parsed = new Date(dueDateRaw);
        if (isNaN(parsed.getTime())) {
          return { rowNumber, ok: false, reason: `Due date "${dueDateRaw}" tidak valid (gunakan YYYY-MM-DD)` };
        }
        dueDate = dueDateRaw;
      }

      return {
        rowNumber,
        ok: true,
        data: {
          judul,
          disciplineId: discipline.id,
          zoneId: zone.id,
          priorityId: priority.id,
          deskripsi,
          dueDate,
        },
      };
    });
  }

  function handlePreview() {
    setResults(runValidation());
    setStep("preview");
  }

  async function handleCommit() {
    if (!results) return;
    setIsCommitting(true);
    setCommitProgress(0);

    // Committed sequentially, one API call per row — there is no bulk-create
    // endpoint or server-side transaction, so a failure partway through
    // leaves earlier rows created and later rows skipped. That is reported
    // below rather than hidden.
    let success = 0;
    const errors: string[] = [];
    for (const r of results) {
      if (r.ok && r.data) {
        try {
          await createClash({ ...r.data, attachments: [] }, importerId);
          success++;
        } catch {
          errors.push(`Baris ${r.rowNumber} ("${r.data.judul}"): gagal disimpan ke server.`);
        }
        setCommitProgress((p) => p + 1);
      }
    }

    setCommitSummary({ success, failed: errors.length, errors });
    setIsCommitting(false);
  }

  const validCount = results?.filter((r) => r.ok).length ?? 0;
  const invalidCount = results ? results.length - validCount : 0;
  const mappingComplete = REQUIRED_FIELDS.every((f) => mapping[f]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Import Clash dari CSV</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Upload → petakan kolom → pratinjau &amp; commit. Cocok untuk hasil export Navisworks/Solibri yang
        sudah dirapikan ke CSV.
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
          {fileError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{fileError}</p>
          )}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 px-6 py-10 text-center hover:border-zinc-400"
          >
            <p className="text-sm font-medium text-zinc-600">Klik untuk memilih file CSV</p>
            <p className="mt-1 text-xs text-zinc-400">Baris pertama harus berisi nama kolom</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-2 text-xs font-medium text-zinc-600">Contoh format CSV yang didukung:</p>
            <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{SAMPLE_CSV}</pre>
            <button
              onClick={() => {
                const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "contoh-import-clashhub.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
            >
              Unduh contoh CSV ini
            </button>
          </div>
        </div>
      )}

      {step === "mapping" && (
        <div className="mt-6">
          <p className="mb-4 text-sm text-zinc-600">
            <span className="font-medium">{fileName}</span> — {rows.length} baris terdeteksi, kolom:{" "}
            {headers.join(", ")}
          </p>
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
            {(Object.keys(FIELD_LABELS) as (keyof Mapping)[]).map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {FIELD_LABELS[field]}
                </label>
                <select
                  value={mapping[field]}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
                >
                  <option value="">-- pilih kolom --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-between">
            <button
              onClick={() => setStep("upload")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Kembali
            </button>
            <button
              onClick={handlePreview}
              disabled={!mappingComplete}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              Lanjut ke Preview
            </button>
          </div>
        </div>
      )}

      {step === "preview" && results && (
        <div className="mt-6">
          {commitSummary ? (
            <div
              className={`rounded-2xl border p-6 text-center ${
                commitSummary.failed > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  commitSummary.failed > 0 ? "text-amber-800" : "text-emerald-800"
                }`}
              >
                Import selesai: {commitSummary.success} clash berhasil dibuat
                {invalidCount > 0 && `, ${invalidCount} baris dilewati saat validasi`}
                {commitSummary.failed > 0 && `, ${commitSummary.failed} baris gagal disimpan ke server`}.
              </p>
              {commitSummary.errors.length > 0 && (
                <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-amber-700">
                  {commitSummary.errors.map((err) => (
                    <li key={err}>• {err}</li>
                  ))}
                </ul>
              )}
              <Link
                href="/register"
                className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Lihat di Register
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4 flex gap-4 text-sm">
                <span className="font-medium text-emerald-700">{validCount} baris valid</span>
                <span className="font-medium text-red-600">{invalidCount} baris gagal</span>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-2xl border border-zinc-200 bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-2">Baris</th>
                      <th className="px-4 py-2">Judul</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.rowNumber} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-2 text-zinc-500">{r.rowNumber}</td>
                        <td className="px-4 py-2 text-zinc-700">{r.data?.judul ?? "-"}</td>
                        <td className="px-4 py-2">
                          {r.ok ? (
                            <span className="text-emerald-700">Siap diimpor</span>
                          ) : (
                            <span className="text-red-600">{r.reason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
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
                <div className="flex items-center gap-3">
                  {isCommitting && (
                    <span className="text-xs text-zinc-500">
                      Menyimpan {commitProgress}/{validCount}…
                    </span>
                  )}
                  <button
                    onClick={handleCommit}
                    disabled={validCount === 0 || isCommitting}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {isCommitting ? "Menyimpan…" : `Commit ${validCount} Clash`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
