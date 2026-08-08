"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";

const PASSWORD_CHANGE_PATH = "/settings/password";

const ROLE_LABEL: Record<string, string> = {
  Engineer: "Field / Design Engineer",
  Coordinator: "BIM Coordinator",
  Management: "Project Management",
  Admin: "System Administrator",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { project, projects, setActiveProject, syncError } = useData();
  const pathname = usePathname();
  const router = useRouter();

  // Global gate: a user whose password is still the one-time temporary
  // value (fresh account or admin reset — see UsersService) cannot use
  // anything else until they change it. Lives here rather than in
  // useRequireAuth() because AppShell is the one wrapper every route
  // renders inside (including pages like /dashboard that don't call any
  // auth hook themselves), so this is the only choke point guaranteed to
  // catch all of them — including client-side navigation between routes,
  // since the effect re-runs on every pathname change.
  useEffect(() => {
    if (user?.mustChangePassword && pathname !== PASSWORD_CHANGE_PATH) {
      router.replace(PASSWORD_CHANGE_PATH);
    }
  }, [user, pathname, router]);

  if (!user) {
    return <>{children}</>;
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", show: user.peran !== "Engineer" },
    { href: "/register", label: "Clash Register", show: true },
    { href: "/clashes/new", label: "Input Clash Baru", show: user.peran !== "Management" },
    { href: "/my-clashes", label: "Clash Saya", show: user.peran === "Engineer" || user.peran === "Coordinator" },
    { href: "/import", label: "Import Clash", show: user.peran === "Coordinator" || user.peran === "Admin" },
  ].filter((i) => i.show);

  const adminItems = [
    { href: "/admin/users", label: "User" },
    { href: "/admin/projects", label: "Proyek" },
    { href: "/admin/master-data", label: "Master Data" },
  ];

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <Image src="/logo.png" alt="EPS Workspace logo" width={36} height={36} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none">EPS Workspace</p>
            {projects.length > 1 ? (
              <select
                aria-label="Proyek aktif"
                value={project.id}
                onChange={(e) => void setActiveProject(e.target.value)}
                className="mt-1 w-full truncate rounded border-none bg-transparent p-0 text-xs text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-300"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kode} — {p.nama}
                  </option>
                ))}
              </select>
            ) : (
              <p className="truncate text-xs text-zinc-500">{project.nama || "Belum ada proyek"}</p>
            )}
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {user.peran === "Admin" && (
            <div className="pt-4">
              <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Administrasi
              </p>
              {adminItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="pt-4">
            <Link
              href="/settings/notifications"
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === "/settings/notifications"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              Pengaturan Notifikasi
            </Link>
            <Link
              href={PASSWORD_CHANGE_PATH}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === PASSWORD_CHANGE_PATH
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              Ganti Password
            </Link>
          </div>
        </nav>
        <div className="border-t border-zinc-200 p-3">
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <p className="truncate text-sm font-medium">{user.nama}</p>
            <p className="truncate text-xs text-zinc-500">{ROLE_LABEL[user.peran]}</p>
          </div>
          <button
            onClick={() => {
              void logout().finally(() => router.push("/login"));
            }}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        {syncError && (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-700"
          >
            Gagal menyimpan ke server: {syncError}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
