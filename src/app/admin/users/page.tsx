"use client";

import { useState } from "react";
import { z } from "zod";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useData } from "@/lib/data-context";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["Engineer", "Coordinator", "Management", "Admin"];

const userSchema = z.object({
  nama: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  peran: z.enum(["Engineer", "Coordinator", "Management", "Admin"]),
});

type FormValues = z.infer<typeof userSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

export default function AdminUsersPage() {
  const { user, isLoading } = useRequireAdmin();
  const { users, createUser, updateUser, toggleUserActive } = useData();
  const [values, setValues] = useState<FormValues>({ nama: "", email: "", peran: "Engineer" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formOpen, setFormOpen] = useState(false);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = userSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof FormValues] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === result.data.email.toLowerCase())) {
      setErrors({ email: "Email sudah digunakan user lain" });
      return;
    }
    setErrors({});
    createUser(result.data);
    setValues({ nama: "", email: "", peran: "Engineer" });
    setFormOpen(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Kelola User</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Buat akun, tetapkan peran, dan nonaktifkan akses. (US-F1)
          </p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          {formOpen ? "Tutup" : "+ User Baru"}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Nama</label>
            <input
              value={values.nama}
              onChange={(e) => setValues((v) => ({ ...v, nama: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.nama ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
              }`}
            />
            {errors.nama && <p className="mt-1 text-xs text-red-600">{errors.nama}</p>}
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Email</label>
            <input
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.email ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
              }`}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Peran</label>
            <select
              value={values.peran}
              onChange={(e) => setValues((v) => ({ ...v, peran: e.target.value as Role }))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end sm:col-span-4">
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Simpan User
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3 text-sm text-zinc-800">{u.nama}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.peran}
                    onChange={(e) => updateUser(u.id, { peran: e.target.value as Role })}
                    disabled={u.id === user.id}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs outline-none disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      u.isActive
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-300"
                        : "bg-zinc-100 text-zinc-500 ring-zinc-300"
                    }`}
                  >
                    {u.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleUserActive(u.id)}
                    disabled={u.id === user.id}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline disabled:opacity-40"
                  >
                    {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Anda tidak dapat mengubah peran atau menonaktifkan akun Anda sendiri.
      </p>
    </div>
  );
}
