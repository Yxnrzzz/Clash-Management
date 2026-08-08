"use client";

import { useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";
import { ApiError, changePassword } from "@/lib/api/client";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    newPassword: z
      .string()
      .min(12, "Password baru minimal 12 karakter")
      .regex(/(?=.*[A-Za-z])(?=.*\d)/, "Password baru harus mengandung huruf dan angka"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof passwordSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ChangePasswordPage() {
  const { user, isLoading } = useRequireAuth();
  const { reloadMasterData } = useData();
  const router = useRouter();

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = passwordSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof FormValues] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await changePassword(result.data.currentPassword, result.data.newPassword);
      // The server's response already carries the updated user, but this
      // page derives `user` from the shared master-data users list (see
      // auth-context.tsx) — reload it so mustChangePassword flips to false
      // everywhere at once instead of only in the response we just got.
      await reloadMasterData();
      setValues(EMPTY_FORM);
      setDone(true);
      setTimeout(() => router.replace("/register"), 1200);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Gagal mengganti password. Coba lagi."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Ganti Password</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {user.mustChangePassword
          ? "Akun Anda masih menggunakan password sementara — ganti dulu sebelum melanjutkan."
          : "Mengganti password akan mengeluarkan sesi Anda di perangkat lain."}
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        {formError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {formError}
          </div>
        )}
        {done && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Password berhasil diganti. Mengalihkan…
          </div>
        )}

        <div>
          <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-zinc-700">
            Password Saat Ini
          </label>
          <input
            id="currentPassword"
            type="password"
            value={values.currentPassword}
            onChange={(e) => setValues((v) => ({ ...v, currentPassword: e.target.value }))}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.currentPassword
                ? "border-red-300 focus:ring-red-200"
                : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.currentPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.currentPassword}</p>
          )}
        </div>

        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-zinc-700">
            Password Baru
          </label>
          <input
            id="newPassword"
            type="password"
            value={values.newPassword}
            onChange={(e) => setValues((v) => ({ ...v, newPassword: e.target.value }))}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.newPassword ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.newPassword ? (
            <p className="mt-1 text-xs text-red-600">{errors.newPassword}</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">Minimal 12 karakter, mengandung huruf dan angka.</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-zinc-700">
            Konfirmasi Password Baru
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={values.confirmPassword}
            onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              errors.confirmPassword
                ? "border-red-300 focus:ring-red-200"
                : "border-zinc-300 focus:ring-zinc-300"
            }`}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {submitting ? "Memproses…" : "Ganti Password"}
        </button>
      </form>
    </div>
  );
}
