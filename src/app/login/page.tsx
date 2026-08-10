"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";

const loginSchema = z.object({
  email: z.string().min(1, "Email wajib diisi").email("Format email tidak valid"),
  password: z.string().min(4, "Password minimal 4 karakter"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

/** Password shared by every seeded account absent a SEED_PASSWORD override
 * (see apps/api/prisma/seed.ts) — every seeded account also starts with
 * mustChangePassword: true, so signing in here immediately routes to
 * /settings/password before anything else is usable. */
const DEMO_PASSWORD = "demo1234-local-dev-only";

// Listed statically: the user list now comes from the API, which needs a
// session — so there is nothing to read from before signing in.
const DEMO_ACCOUNTS = [
  { peran: "Engineer", email: "engineer@clashhub.dev" },
  { peran: "Coordinator", email: "coordinator@clashhub.dev" },
  { peran: "Management", email: "management@clashhub.dev" },
  { peran: "Admin", email: "admin@clashhub.dev" },
] as const;

// NODE_ENV is set automatically by Next's own tooling (`next dev` →
// "development", `next build`/`next start` → "production") — no env file to
// remember to configure. The production Dockerfile inherits that, so this
// autofill convenience card (and the demo credentials with it) disappears
// from production builds by construction, without deleting it from source
// or requiring a new env var someone could forget to set.
const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV !== "production";

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/register");
    }
  }, [isLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
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
    setSubmitting(true);
    const res = await login(result.data.email, result.data.password);
    setSubmitting(false);
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
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl">
            <Image src="/logo.png" alt="EPS Workspace logo" width={64} height={64} className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">EPS Workspace</h1>
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
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {submitting ? "Memproses…" : "Masuk"}
          </button>
        </form>

        {SHOW_DEMO_ACCOUNTS && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500">
            <p className="mb-2 font-medium text-zinc-700">
              Akun demo (password <span className="font-mono">{DEMO_PASSWORD}</span>):
            </p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email} className="flex items-center justify-between">
                  <span>{account.peran}</span>
                  <button
                    type="button"
                    className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-zinc-700 hover:bg-zinc-200"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                    }}
                  >
                    {account.email}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
