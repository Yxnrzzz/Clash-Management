"use client";

import { useState } from "react";
import { z } from "zod";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useData } from "@/lib/data-context";

const projectSchema = z.object({
  nama: z.string().min(2, "Nama proyek minimal 2 karakter"),
  kode: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .max(6, "Kode maksimal 6 karakter")
    .regex(/^[A-Za-z0-9]+$/, "Kode hanya boleh huruf/angka"),
});

type FormValues = z.infer<typeof projectSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

export default function AdminProjectsPage() {
  const { user, isLoading } = useRequireAdmin();
  const { project, users, updateProject } = useData();
  const [values, setValues] = useState<FormValues>({ nama: project.nama, kode: project.kode });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = projectSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof FormValues] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    updateProject({ nama: result.data.nama, kode: result.data.kode.toUpperCase() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const memberCounts = ["Engineer", "Coordinator", "Management", "Admin"].map((role) => ({
    role,
    count: users.filter((u) => u.peran === role && u.isActive).length,
  }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Pengaturan Proyek</h1>
      <p className="mt-1 text-sm text-zinc-500">
        ClashHub versi ini mengelola satu proyek aktif. Kode proyek dipakai sebagai awalan kode unik
        clash (mis. {values.kode || "MCA"}-MEP-0001).
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5"
      >
        {saved && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Perubahan tersimpan.
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Nama Proyek</label>
          <input
            value={values.nama}
            onChange={(e) => setValues((v) => ({ ...v, nama: e.target.value }))}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.nama ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.nama && <p className="mt-1 text-xs text-red-600">{errors.nama}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Kode Proyek</label>
          <input
            value={values.kode}
            onChange={(e) => setValues((v) => ({ ...v, kode: e.target.value.toUpperCase() }))}
            className={`w-full max-w-xs rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 ${
              errors.kode ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.kode && <p className="mt-1 text-xs text-red-600">{errors.kode}</p>}
          <p className="mt-1 text-xs text-zinc-400">
            Mengubah kode tidak mengubah kode_unik clash yang sudah ada.
          </p>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Simpan
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Anggota Proyek (per peran)</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Semua user aktif otomatis menjadi anggota proyek ini — kelola user di{" "}
          <a href="/admin/users" className="underline">
            halaman User
          </a>
          .
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {memberCounts.map((m) => (
            <div key={m.role}>
              <dt className="text-xs text-zinc-400">{m.role}</dt>
              <dd className="text-lg font-semibold text-zinc-900">{m.count}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
