"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";

const ROLE_LABEL: Record<string, string> = {
  Engineer: "Field / Design Engineer",
  Coordinator: "BIM Coordinator",
  Management: "Project Management",
  Admin: "System Administrator",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { project } = useData();
  const pathname = usePathname();
  const router = useRouter();

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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
            CH
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">ClashHub</p>
            <p className="text-xs text-zinc-500">{project.nama}</p>
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
                pathname.startsWith("/settings")
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              Pengaturan Notifikasi
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
              logout();
              router.push("/login");
            }}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
