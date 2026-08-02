"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";

const loginSchema = z.object({
  email: z.string().min(1, "Email wajib diisi").email("Format email tidak valid"),
  password: z.string().min(4, "Password minimal 4 karakter"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

const DEMO_ROLE_ORDER = ["Engineer", "Coordinator", "Management", "Admin"] as const;

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const { users } = useData();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/register");
    }
  }, [isLoading, user, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as "email" | "password";
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    const res = login(result.data.email, result.data.password);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    router.replace("/register");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-lg font-bold text-white">
            CH
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">ClashHub</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Web platform manajemen clash &amp; issue koordinasi BIM
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          {formError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              {formError}
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@perusahaan.com"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.email
                  ? "border-red-300 focus:ring-red-200"
                  : "border-zinc-300 focus:ring-zinc-300"
              }`}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.password
                  ? "border-red-300 focus:ring-red-200"
                  : "border-zinc-300 focus:ring-zinc-300"
              }`}
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Masuk
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500">
          <p className="mb-2 font-medium text-zinc-700">Akun demo (password bebas, min. 4 karakter):</p>
          <ul className="space-y-1">
            {DEMO_ROLE_ORDER.map((role) => users.find((u) => u.peran === role && u.isActive))
              .filter((u): u is NonNullable<typeof u> => Boolean(u))
              .map((u) => (
              <li key={u.id} className="flex items-center justify-between">
                <span>{u.peran}</span>
                <button
                  type="button"
                  className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-zinc-700 hover:bg-zinc-200"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword("demo1234");
                  }}
                >
                  {u.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
