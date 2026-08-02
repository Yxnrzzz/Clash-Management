# ClashHub

Web platform manajemen clash & issue koordinasi BIM, dibangun sesuai [ClashHub_PRD.md](./ClashHub_PRD.md).

Repo ini berisi dua paket:

| Paket | Lokasi | Port |
|---|---|---|
| Frontend Next.js | root (`src/`) | 3000 |
| Backend NestJS | [`apps/api/`](./apps/api/README.md) | 3001 (prefix `/api`) |

Seluruh deliverable frontend dari [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md) sudah diimplementasikan: Login/RBAC, Input Clash + lampiran, Clash Register (filter/sort/search/pagination/bulk update/export), Halaman Rincian (triase, komentar, audit trail), Clash Saya, Dashboard KPI dengan drill-down, Admin panel (User/Proyek/Master Data), Pengaturan Notifikasi, dan Import CSV.

**Backend Sprint 0 & 1 juga sudah selesai dan tersambung**: autentikasi JWT sungguhan dengan password argon2id, RBAC yang ditegakkan di server, dan CRUD user/proyek/master-data yang menulis ke PostgreSQL.

> **Fase hybrid.** `project`, `users`, `disciplines`, `zones`, `statuses`, dan `priorities` datang dari API. `clashes`, `comments`, `auditLogs`, `attachments`, dan `notificationPreferences` **masih di `localStorage`** sampai `ClashesModule` dibangun. Detail lengkap di [HANDOFF.md](./HANDOFF.md).

## Tech stack

**Frontend** — Next.js (App Router) + React + TypeScript, Tailwind CSS, TanStack Table, Recharts, Zod, SheetJS (xlsx), jsPDF.
**Backend** — NestJS + Prisma + PostgreSQL 16, passport-jwt, `@node-rs/argon2`, class-validator, Jest.

Sesuai rekomendasi final di PRD Bagian 4.2 / Sprint Plan.

## Menjalankan

Butuh **dua** server berjalan bersamaan.

```bash
docker compose -f apps/api/docker-compose.yml up -d
npm install && npm --prefix apps/api install
npm --prefix apps/api exec prisma migrate deploy
npm --prefix apps/api exec prisma db seed
```

Lalu di dua terminal terpisah:

```bash
npm --prefix apps/api run start:dev
```

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Frontend mem-proxy `/api/*` ke backend lewat `rewrites` di `next.config.ts`, jadi tidak ada konfigurasi CORS yang perlu diurus. **Tanpa backend hidup, login akan gagal dan seluruh master data kosong.**

## Akun demo

Password untuk semua akun: **`demo1234`** (di-hash argon2id di database). Admin bisa membuat user baru dari `/admin/users` — akun baru tersimpan di database dengan password default yang sama dan langsung bisa dipakai login.

| Peran | Email |
|---|---|
| Engineer | engineer@clashhub.dev |
| Coordinator | coordinator@clashhub.dev |
| Management | management@clashhub.dev |
| Admin | admin@clashhub.dev |

## Struktur

- `src/lib/api/` — lapisan HTTP. `client.ts` (access token di memori + retry otomatis lewat `/auth/refresh` saat 401), `mappers.ts` (satu-satunya tempat terjemahan istilah Inggris API ↔ Indonesia domain), `types.ts` (bentuk respons mentah).
- `src/lib/data-context.tsx` — state aplikasi. **Hybrid**: master data di-fetch dari API, clash/komentar/audit/lampiran/preferensi masih dipersist ke `localStorage` (`clashhub-data-v3`).
- `src/lib/mock-data.ts` — `INITIAL_*` + generator ~87 clash contoh. Sejak master data pindah ke API, `INITIAL_*` hanya dipakai oleh generator clash.
- `src/lib/use-master-data.ts` — hook lookup (`disciplineById`, `statusById`, dst.) yang terikat ke array master data *live*, bukan konstanta statis.
- `src/lib/auth-context.tsx` — autentikasi sungguhan; sesi dipulihkan dari cookie refresh saat mount, dan `user` tetap diturunkan dari daftar user live sehingga perubahan role/nonaktivasi oleh Admin langsung berefek pada sesi yang berjalan.
- `src/lib/lookup.ts` — helper format & aturan RBAC murni (hak edit, hak komentar).
- `src/lib/export.ts` — export Excel (SheetJS) & PDF (jsPDF/autotable), menghormati filter aktif di Register.
- `src/lib/csv.ts` — parser CSV minimal untuk wizard import.
- `src/lib/dashboard-metrics.ts` — agregasi KPI, tren mingguan, dan sebaran per disiplin/prioritas/zona.
- `src/components/dashboard/viz-tokens.ts` — warna chart hasil validasi (lihat catatan di bawah).
- Halaman: `/login`, `/register`, `/clashes/new`, `/clashes/[id]`, `/my-clashes`, `/dashboard`, `/import`, `/settings/notifications`, `/admin/users`, `/admin/projects`, `/admin/master-data`.

## Catatan chart

Warna chart divalidasi terhadap surface kartu aplikasi (`#ffffff`), bukan sekadar dipilih dengan mata:

- Palet kategorikal (tren dibuat vs ditutup) — lolos semua check, CVD ΔE 24.7.
- Ramp ordinal prioritas Low→Critical — lolos semua check, lightness monoton.

Disiplin dan zona adalah kategori **nominal**, jadi keduanya memakai satu warna datar; memberi ramp nilai di sana justru meng-encode ganda panjang batang. Prioritas adalah tingkatan **berurutan**, sehingga ramp satu-hue sah dipakai. Setiap chart punya kembaran tabel (toggle "Tampilkan tabel data") agar tidak ada nilai yang hanya bisa dibaca lewat warna atau tooltip.

## RBAC yang diterapkan

- **Management**: baca-saja di seluruh Register, Detail, & Dashboard; tidak bisa membuat clash, komentar, atau bulk update.
- **Engineer**: bisa input clash baru; di item yang di-assign ke dirinya hanya bisa transisi status maju satu langkah (Open → In Progress → Resolved, tidak bisa menutup atau mundur); tidak bisa mengakses Dashboard atau Admin.
- **Coordinator**: kelola penuh clash — assign, ubah prioritas/due date, semua transisi status, bulk update, import CSV; tidak bisa mengakses halaman Admin.
- **Admin**: seperti Coordinator, ditambah akses penuh ke `/admin/*` (User, Proyek, Master Data).

RBAC ini ditegakkan di **dua** lapis: guard route di client (untuk UX) dan `RolesGuard` di NestJS (401 tanpa token, 403 untuk peran yang tidak berhak). Tabel endpoint lengkap ada di [apps/api/README.md](./apps/api/README.md).

## Apa yang nyata, apa yang belum

- **Master data** (user, disiplin, zona, prioritas, status) tersimpan di PostgreSQL dan dikelola lewat Admin panel — user baru langsung bisa login, disiplin yang dinonaktifkan langsung hilang dari form input baru (tapi tetap muncul di filter Register dengan label "(nonaktif)" untuk data historis). Penghapusan memakai pola **soft-delete** lewat `isActive` supaya clash lama tidak jadi orphan.
- **Clash, komentar, audit log** masih di `localStorage`. `ClashesModule` adalah pekerjaan berikutnya.
- **Lampiran** memakai `File` sungguhan dan menampilkan pratinjau nyata (object URL) selama sesi browser berjalan, tapi **tidak** bertahan setelah reload karena belum ada object storage. Halaman detail menampilkan pesan "pratinjau tidak tersedia setelah reload" alih-alih pura-pura masih ada.

## Reset data demo

Clash & komentar (localStorage) — lewat DevTools console:

```js
localStorage.clear(); location.reload();
```

Master data & user (database) — seed bersifat idempoten:

```bash
npm --prefix apps/api exec prisma db seed
```

## Lanjutan

Berikutnya: **`ClashesModule`** (clash, komentar, audit log, lampiran) untuk menghabiskan sisa `localStorage`, lalu object storage untuk lampiran permanen, Redis/BullMQ untuk notifikasi email & WhatsApp asli (Sprint 5 & 8), fitur AI opsional (Sprint 10), dan hardening/deploy (Sprint 11). Detail rencana di [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md); catatan teknis & jebakan di [HANDOFF.md](./HANDOFF.md).
