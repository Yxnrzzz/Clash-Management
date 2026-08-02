# ClashHub — Frontend

Frontend web platform manajemen clash & issue koordinasi BIM, dibangun sesuai [ClashHub_PRD.md](./ClashHub_PRD.md).

Seluruh deliverable frontend dari [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md) sudah diimplementasikan: Login/RBAC, Input Clash + lampiran, Clash Register (filter/sort/search/pagination/bulk update/export), Halaman Rincian (triase, komentar, audit trail), Clash Saya, Dashboard KPI dengan drill-down, Admin panel (User/Proyek/Master Data), Pengaturan Notifikasi, dan Import CSV. Belum ada backend: seluruh data memakai **mock data lokal** yang dipersist ke `localStorage` browser, sehingga aksi (buat clash, ubah status, komentar, CRUD master data) terasa nyata tanpa server.

> Sprint yang murni backend (5 — email async, 8 — WhatsApp API, 10 — model AI, 11 — deploy) di luar cakupan frontend ini. Ada juga scaffold NestJS terpisah di `apps/api/` (di luar `src/`, tidak disentuh proyek ini).

## Tech stack

Next.js (App Router) + React + TypeScript, Tailwind CSS, TanStack Table, Recharts, Zod, SheetJS (xlsx), jsPDF — sesuai rekomendasi final di PRD Bagian 4.2 / Sprint Plan.

## Menjalankan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Akun demo

Login dengan salah satu email berikut (password bebas, minimal 4 karakter). Admin bisa membuat user baru dari `/admin/users` — akun baru langsung bisa dipakai login (password tetap bebas, ini mock, bukan autentikasi asli).

| Peran | Email |
|---|---|
| Engineer | engineer@clashhub.dev |
| Coordinator | coordinator@clashhub.dev |
| Management | management@clashhub.dev |
| Admin | admin@clashhub.dev |

## Struktur

- `src/lib/mock-data.ts` — `INITIAL_*` (project, user, disiplin, zona, status, prioritas) yang men-seed state awal + generator ~87 clash contoh.
- `src/lib/data-context.tsx` — seluruh state aplikasi (clash, master data, komentar, audit log, preferensi notifikasi) di client, dipersist ke `localStorage` (`clashhub-data-v2`). Master data bersifat **mutable** — bisa diubah lewat halaman Admin.
- `src/lib/use-master-data.ts` — hook lookup (`disciplineById`, `statusById`, dst.) yang terikat ke array master data *live*, bukan konstanta statis.
- `src/lib/auth-context.tsx` — mock auth; user diturunkan dari daftar user live sehingga perubahan role/nonaktivasi oleh Admin langsung berefek pada sesi yang sedang login.
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

## Master data & lampiran — apa yang nyata, apa yang tidak

- **Master data** (user, disiplin, zona, prioritas, status) sepenuhnya mutable lewat Admin panel dan tersambung ke seluruh aplikasi — user baru bisa langsung login, disiplin yang dinonaktifkan langsung hilang dari form input baru (tapi tetap bisa difilter di Register untuk data historis).
- **Lampiran** memakai `File` sungguhan dari input pengguna dan menampilkan pratinjau nyata (object URL) selama sesi browser masih berjalan. Ini **tidak** bertahan setelah reload karena tidak ada object storage backend — halaman detail menampilkan pesan "pratinjau tidak tersedia setelah reload" untuk lampiran lama, alih-alih pura-pura masih ada.

## Reset data demo

Untuk mengembalikan ke data seed awal, hapus localStorage lewat DevTools console:

```js
localStorage.clear();
location.reload();
```

## Lanjutan

Yang tersisa murni backend: NestJS + PostgreSQL + Prisma + Redis/BullMQ (notifikasi email/WhatsApp asli, autentikasi JWT sungguhan, object storage untuk lampiran permanen), plus fitur AI opsional (Sprint 10) dan hardening/deploy (Sprint 11). Detail di [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md).
