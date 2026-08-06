# EPS Workspace

Web platform manajemen clash & issue koordinasi BIM, dibangun sesuai [ClashHub_PRD.md](./ClashHub_PRD.md) (nama produk berubah menjadi "EPS Workspace" setelah dokumen-dokumen sumber di bawah ditulis — lihat HANDOFF.md).

Repo ini berisi dua paket:

| Paket | Lokasi | Port |
|---|---|---|
| Frontend Next.js | root (`src/`) | 3000 |
| Backend NestJS | [`apps/api/`](./apps/api/README.md) | 3001 (prefix `/api`) |

**Sprint 0-9 dari [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md) sudah selesai, backend dan frontend, dan tersambung penuh** — Login/RBAC, Input Clash + lampiran, Clash Register (filter/sort/search/pagination/bulk update/export), Halaman Rincian (triase, komentar, audit trail), Clash Saya, Dashboard KPI dengan drill-down, notifikasi email + WhatsApp async, Admin panel (User/Proyek/Master Data + template antar proyek), Pengaturan Notifikasi, dan Import CSV/XML massal (async, dedup, auto-create master data). **CI (GitHub Actions) dan Dockerfile produksi (web + api) juga sudah ada.** **Sprint 11 (hardening/performa/observability) sebagian besar juga selesai**: helmet, rate limiting, global exception filter, validasi env, refresh token versioned, logging terstruktur (pino), Sentry opsional, `/health/ready`, dan uji beban k6 nyata terhadap 10.000 clash — ketiga target NFR PRD lolos (lihat [HANDOFF.md](./HANDOFF.md) §12 untuk angka p95). Yang belum: deploy ke host nyata (baru artefak/dokumentasi, tidak ada target infrastruktur), dan Sprint 10 (fitur AI, opsional, sengaja ditunda). Detail lengkap & catatan teknis ada di [HANDOFF.md](./HANDOFF.md) — dokumen itu adalah sumber kebenaran untuk status proyek, bukan file ini.

**Tidak ada lagi apa pun yang client-only.** Seluruh data (project, users, master data, clash, komentar, audit log, lampiran, preferensi notifikasi, job impor) tersimpan dan ditegakkan RBAC-nya di NestJS + PostgreSQL; `localStorage` sudah pensiun total.

## Tech stack

**Frontend** — Next.js (App Router) + React + TypeScript, Tailwind CSS, TanStack Table, Recharts, Zod, SheetJS (xlsx), jsPDF.
**Backend** — NestJS + Prisma + PostgreSQL 16, Redis + BullMQ (notifikasi & job impor async), passport-jwt, `@node-rs/argon2`, class-validator, fast-xml-parser, Jest.

Sesuai rekomendasi final di PRD Bagian 4.2 / Sprint Plan.

## Menjalankan

Butuh **dua** server berjalan bersamaan.

```bash
docker compose -f apps/api/docker-compose.yml up -d
npm install && npm --prefix apps/api install
npm --prefix apps/api exec prisma migrate deploy
npm --prefix apps/api exec prisma db seed
```

`docker compose up -d` menjalankan tiga service: `postgres`, `redis` (BullMQ — notifikasi & impor), dan `mailhog` (kotak masuk email dev, UI di `http://localhost:8025`).

Lalu di dua terminal terpisah:

```bash
npm --prefix apps/api run start:dev
```

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Frontend mem-proxy `/api/*` ke backend lewat `rewrites` di `next.config.ts`, jadi tidak ada konfigurasi CORS yang perlu diurus. **Tanpa backend hidup, login akan gagal dan seluruh master data kosong.**

### Menjalankan dengan Docker (produksi)

Ada Dockerfile produksi terpisah untuk masing-masing paket (`Dockerfile` di root untuk web, `apps/api/Dockerfile` untuk api — keduanya multi-stage, image runner non-root). `docker-compose.prod.yml` di root menyatukan keduanya dengan Postgres + Redis:

```bash
cp apps/api/.env.example apps/api/.env   # lalu isi JWT_*_SECRET dsb dengan nilai produksi, bukan placeholder dev
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Ini **terpisah** dari `apps/api/docker-compose.yml` yang dipakai sehari-hari (dependensi dev saja — `postgres`/`redis`/`mailhog`, aplikasi tetap dijalankan via `npm run dev`); `docker-compose.prod.yml` menjalankan aplikasinya juga sebagai container.

## Akun demo

Password untuk semua akun: **`demo1234`** (di-hash argon2id di database). Admin bisa membuat user baru dari `/admin/users` — akun baru tersimpan di database dengan password default yang sama dan langsung bisa dipakai login.

| Peran | Email |
|---|---|
| Engineer | engineer@clashhub.dev |
| Coordinator | coordinator@clashhub.dev |
| Management | management@clashhub.dev |
| Admin | admin@clashhub.dev |

## Struktur

- `src/lib/api/` — lapisan HTTP. `client.ts` (access token di memori + retry otomatis lewat `/auth/refresh` saat 401), `mappers.ts` (satu-satunya tempat terjemahan istilah Inggris API ↔ Indonesia domain), `types.ts` (bentuk respons mentah dari API), `import.ts` (fungsi impor massal & template master data).
- `src/lib/data-context.tsx` — seluruh state aplikasi (project, users, master data, clash, komentar, audit log, lampiran, preferensi notifikasi) di-fetch dari API; tidak ada lagi persist ke `localStorage`.
- `src/lib/use-master-data.ts` — hook lookup (`disciplineById`, `statusById`, dst.) yang terikat ke array master data *live*, bukan konstanta statis.
- `src/lib/auth-context.tsx` — autentikasi sungguhan; sesi dipulihkan dari cookie refresh saat mount, dan `user` tetap diturunkan dari daftar user live sehingga perubahan role/nonaktivasi oleh Admin langsung berefek pada sesi yang berjalan.
- `src/lib/lookup.ts` — helper format & aturan RBAC murni (hak edit, hak komentar) — UX saja; penegakan sesungguhnya ada di server.
- `src/lib/export.ts` — export Excel (SheetJS) & PDF (jsPDF/autotable), menghormati filter aktif di Register.
- `src/lib/dashboard-metrics.ts` — port frontend dari agregasi KPI/tren/sebaran yang sebenarnya dihitung server-side (`GET /clashes/metrics`); dipakai untuk memformat, bukan menghitung ulang dari nol.
- `src/components/dashboard/viz-tokens.ts` — warna chart hasil validasi (lihat catatan di bawah).
- Halaman: `/login`, `/register`, `/clashes/new`, `/clashes/[id]`, `/my-clashes`, `/dashboard`, `/import`, `/settings/notifications`, `/admin/users`, `/admin/projects`, `/admin/master-data`.

## Catatan chart

Warna chart divalidasi terhadap surface kartu aplikasi (`#ffffff`), bukan sekadar dipilih dengan mata:

- Palet kategorikal (tren dibuat vs ditutup) — lolos semua check, CVD ΔE 24.7.
- Ramp ordinal prioritas Low→Critical — lolos semua check, lightness monoton.

Disiplin dan zona adalah kategori **nominal**, jadi keduanya memakai satu warna datar; memberi ramp nilai di sana justru meng-encode ganda panjang batang. Prioritas adalah tingkatan **berurutan**, sehingga ramp satu-hue sah dipakai. Setiap chart punya kembaran tabel (toggle "Tampilkan tabel data") agar tidak ada nilai yang hanya bisa dibaca lewat warna atau tooltip.

## RBAC yang diterapkan

- **Management**: baca-saja di seluruh Register, Detail, & Dashboard; tidak bisa membuat clash, komentar, atau bulk update.
- **Engineer**: bisa input clash baru; di item yang di-assign ke dirinya hanya bisa transisi status maju satu langkah (Open → In Progress → Resolved, tidak bisa menutup atau mundur); tidak bisa mengakses Dashboard, Import, atau Admin.
- **Coordinator**: kelola penuh clash — assign, ubah prioritas/due date, semua transisi status, bulk update, import CSV/XML massal; tidak bisa mengakses halaman Admin.
- **Admin**: seperti Coordinator, ditambah akses penuh ke `/admin/*` (User, Proyek, Master Data — termasuk toggle aktif/nonaktif dan salin template antar proyek) serta opsi "buat master data otomatis" saat impor.

RBAC ini ditegakkan di **dua** lapis: guard route di client (untuk UX) dan `RolesGuard`/logika per-field di NestJS (401 tanpa token, 403 untuk peran yang tidak berhak) — lapisan client hanya UX, bukan pertahanan sesungguhnya. Tabel endpoint lengkap ada di [apps/api/README.md](./apps/api/README.md).

## Apa yang nyata, apa yang belum

- **Master data** (user, disiplin, zona, prioritas, status) tersimpan di PostgreSQL dan dikelola lewat Admin panel — user baru langsung bisa login, disiplin yang dinonaktifkan langsung hilang dari form input baru (tapi tetap muncul di filter Register dengan label "(nonaktif)" untuk data historis). Penghapusan memakai pola **soft-delete** lewat `isActive` supaya clash lama tidak jadi orphan.
- **Clash, komentar, audit log, lampiran** tersimpan penuh di database (lampiran di disk lokal via `StorageService`, S3/R2-ready lewat seam yang sama). Tidak ada lagi batasan "hilang setelah reload".
- **Notifikasi** email (via MailHog di dev) dan WhatsApp (mock provider, bukan Business API asli) berjalan async lewat BullMQ + Redis.
- **Import massal** CSV dan XML (Navisworks/Solibri) diproses sebagai job async di server dengan dedup by `external_id` dan opsi auto-create master data (Admin).
- **Hardening & performa (Sprint 11)** — `helmet`, rate limiting (global + `/auth/login`), global exception filter, validasi env saat boot, refresh token versioned (logout benar-benar invalidate), logging terstruktur (pino), Sentry opsional, `/health/ready`. Uji beban k6 nyata terhadap 10.000 clash: Register p95=88ms, Dashboard p95=167ms, Export p95=1.03s — ketiga di bawah target NFR PRD.
- **Belum ada**: fitur AI (Sprint 10, opsional), deploy ke lingkungan nyata (baru artefak/dokumentasi — lihat [HANDOFF.md](./HANDOFF.md) §13), Prometheus, uptime 99,5% terverifikasi (butuh monitoring produksi riil).

## Reset data demo

Master data & user (idempoten, aman dijalankan ulang):

```bash
npm --prefix apps/api exec prisma db seed
```

Clash/komentar/audit log **tidak** ikut di-reset oleh perintah di atas (disengaja — supaya data yang dibuat lewat aplikasi tidak tertimpa seed). Untuk reset penuh, kosongkan tabel `Clash`/`Comment`/`AuditLog`/`ImportJob` secara manual lalu jalankan ulang perintah seed — lihat "Catatan seed" di [apps/api/README.md](./apps/api/README.md).

## Lanjutan

**Sisa Sprint 11**: deploy ke lingkungan nyata (perlu target infrastruktur — VPS/cloud), Prometheus (opsional), uptime 99,5% terverifikasi (butuh monitoring produksi riil dari waktu ke waktu). Dan opsional **Sprint 10** (fitur AI: auto-kategorisasi + deteksi duplikat, wajib disertai eval harness berlabel). Detail rencana di [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md); catatan teknis, gotcha, dan status sesi-per-sesi di [HANDOFF.md](./HANDOFF.md).
