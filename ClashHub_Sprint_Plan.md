# Sprint Plan & Build Prompts — ClashHub

**Turunan dari:** ClashHub PRD v1.0 & ERD (31 Juli 2026)
**Cakupan:** MVP → v1.1 → v2.0 (full)
**Tech stack (final):** Next.js + React + TypeScript · NestJS (Node) · PostgreSQL · Tailwind CSS + TanStack Table + Recharts · Auth JWT + RBAC · ExcelJS + Puppeteer/pdfmake · WhatsApp Business API · Object storage S3-compatible

Dokumen ini memecah pembangunan ClashHub menjadi 12 sprint (Sprint 0–11, asumsi durasi 2 minggu/sprint). Setiap sprint berisi tujuan, deliverable, acceptance, dependensi, dan **prompt siap-pakai untuk diberikan ke model Sonnet**. Cara pakai: salin blok "Master Context" satu kali di awal sesi, lalu tempel prompt sprint yang sedang dikerjakan.

---

## Cara Menggunakan Dokumen Ini

1. Kerjakan sprint **berurutan** — tiap sprint bergantung pada output sebelumnya.
2. Untuk tiap sprint: buka sesi Sonnet baru, tempel **Master Context** (di bawah), lalu tempel **Prompt Sprint**.
3. Setelah Sonnet menghasilkan kode, jalankan **Definition of Done** sprint tersebut sebelum lanjut.
4. Jika Sonnet kehilangan konteks di tengah sprint, tempel ulang Master Context + ringkasan file yang sudah dibuat.

---

## Master Context (tempel di awal SETIAP sesi Sonnet)

```
Kamu adalah senior full-stack engineer yang membangun "ClashHub" — web platform manajemen clash & issue koordinasi BIM untuk proyek konstruksi. Alur inti: engineer meng-input clash/issue → masuk ke Clash Register terpusat → koordinator men-triase/assign/lacak → dashboard KPI untuk manajemen → notifikasi & export laporan.

TECH STACK (wajib dipatuhi):
- Frontend: Next.js (App Router) + React + TypeScript, Tailwind CSS, TanStack Table (tabel besar), Recharts (chart).
- Backend: NestJS (Node + TypeScript), REST API modular, RBAC.
- Database: PostgreSQL. ORM: Prisma (gunakan Prisma untuk semua akses DB & migrasi).
- Auth: JWT (access + refresh), RBAC berbasis peran.
- File: object storage S3-compatible; lampiran diakses via signed URL (bukan public).
- Export: ExcelJS (Excel) + pdfmake/Puppeteer (PDF).
- Notifikasi: worker async (BullMQ + Redis) untuk email (SMTP/transaksional) & WhatsApp Business API.

PERAN & RBAC:
- Engineer: input clash & kelola item miliknya (reporter/assignee).
- Coordinator: kelola penuh clash dalam proyek (assign, ubah status/prioritas/due date, verifikasi, tutup, bulk).
- Management: read-only (register + dashboard).
- Admin: kelola user, peran, proyek, master data (discipline/zone/status/priority), pengaturan sistem.

MODEL DATA (entitas & FK utama, PostgreSQL, semua PK uuid):
- PROJECT(id, nama, kode UK, created_at)
- USER(id, nama, email UK, peran[Engineer|Coordinator|Management|Admin], is_active, created_at)
- PROJECT_MEMBER(id, project_id FK, user_id FK, peran_proyek, joined_at)  // M:N user↔project
- DISCIPLINE(id, project_id FK, kode, nama)
- ZONE(id, project_id FK, nama, level)
- STATUS(id, nama, urutan, is_closed_state)
- PRIORITY(id, nama, bobot)
- CLASH(id, kode_unik UK, project_id FK, judul, deskripsi, discipline_id FK, zone_id FK, status_id FK, priority_id FK, reporter_id FK, assignee_id FK nullable, due_date, created_at, closed_at)
- ATTACHMENT(id, clash_id FK, nama_file, url, tipe, ukuran_bytes, uploaded_by FK, created_at)
- COMMENT(id, clash_id FK, author_id FK, isi, created_at)
- AUDIT_LOG(id, clash_id FK, actor_id FK, aksi, field, nilai_lama, nilai_baru, created_at)  // immutable, insert-only
- NOTIFICATION(id, user_id FK, clash_id FK, kanal[email|whatsapp], tipe[assigned|status_change|overdue], terkirim, created_at)
- NOTIFICATION_PREFERENCE(id, user_id FK, email_enabled, whatsapp_enabled)  // 1:1 user

ATURAN PENTING:
- Semua master data (discipline/zone/status/priority) berupa TABEL referensi, bukan kolom teks bebas.
- Indeks CLASH pada (project_id, status_id, priority_id, discipline_id, zone_id, assignee_id, due_date, created_at) untuk performa.
- AUDIT_LOG immutable: hanya INSERT, tidak pernah UPDATE/DELETE.
- STATUS.is_closed_state menandai status penutup → set closed_at & konsistensi KPI open vs closed.
- Semua endpoint butuh autentikasi + otorisasi RBAC. Transport HTTPS/TLS.
- Target performa: register filter/sort ≤1 detik; dashboard ≤3 detik untuk 10.000 clash; export ≤10 detik untuk 10.000 baris.

STANDAR KERJA:
- TypeScript strict. Validasi input (Zod di frontend, class-validator/DTO di NestJS).
- Tulis test (unit + integration untuk endpoint kritikal).
- Struktur monorepo: /apps/web (Next.js), /apps/api (NestJS), /packages/shared (tipe & util bersama).
- Setiap kali membuat/mengubah file, tampilkan path lengkap dan kode utuh file tersebut.
- Jangan mengimplementasikan fitur di luar sprint yang diminta. Jika ada asumsi, sebutkan eksplisit di akhir.
```

---

## Peta Sprint (Ringkasan)

| Sprint | Fokus | Fase | Bergantung pada |
|---|---|---|---|
| 0 | Fondasi: monorepo, skema DB, migrasi, seed, auth scaffold, CI | MVP | — |
| 1 | Auth, RBAC, manajemen User/Project/Member, master data admin | MVP | 0 |
| 2 | Input Clash/Issue + upload lampiran (Epik A) | MVP | 1 |
| 3 | Clash Register: filter, sort, search, pagination (Epik B1) | MVP | 2 |
| 4 | Detail Item: komentar, audit trail, assign, transisi status (Epik C, B2) | MVP | 3 |
| 5 | Notifikasi email async (assign/status/overdue) (Epik E1-email) | MVP | 4 |
| 6 | Dashboard KPI + chart + drill-down (Epik D) | v1.1 | 4 |
| 7 | Export Excel/PDF + Bulk update (Epik E2, B3) | v1.1 | 3, 6 |
| 8 | Notifikasi WhatsApp + preferensi kanal (Epik E1-WA) | v1.1 | 5 |
| 9 | Bulk import CSV/XML dari tool BIM + master data lanjutan | v2.0 | 2 |
| 10 | Kandidat AI: auto-kategorisasi & deteksi duplikat + eval harness | v2.0 | 2, 6 |
| 11 | Hardening: performa, keamanan, uji beban, observability, deploy | semua | semua |

---

## SPRINT 0 — Fondasi Proyek

**Tujuan:** Menyiapkan tulang punggung teknis sebelum fitur apa pun ditulis.

**Deliverable:**
- Monorepo (pnpm workspace): `/apps/web`, `/apps/api`, `/packages/shared`.
- Skema Prisma lengkap untuk SELURUH entitas ERD + migrasi awal.
- Seed data: 1 project contoh, master data (discipline ARS/STR/MEP, zone, status Open→In Progress→Resolved→Closed, priority Low→Critical), 1 user tiap peran.
- Setup Docker Compose (PostgreSQL + Redis).
- NestJS app boot + health endpoint; Next.js app boot + halaman kosong.
- Konfigurasi lint, format, TS strict, dan CI (GitHub Actions: install, lint, test, build).

**Definition of Done:** `docker compose up` jalan; `prisma migrate` sukses; seed masuk; `GET /health` 200; web & api build hijau di CI.

### Prompt Sprint 0

```
[Tempel Master Context di atas dulu.]

TUGAS SPRINT 0 — Fondasi Proyek.

Buat scaffold monorepo ClashHub dengan pnpm workspace:
1. Struktur: /apps/web (Next.js App Router + TS + Tailwind), /apps/api (NestJS + TS), /packages/shared (tipe TypeScript & enum bersama: Peran, StatusName, dsb).
2. Prisma: tulis schema.prisma LENGKAP untuk SEMUA entitas berikut sesuai ERD ClashHub: PROJECT, USER, PROJECT_MEMBER, DISCIPLINE, ZONE, STATUS, PRIORITY, CLASH, ATTACHMENT, COMMENT, AUDIT_LOG, NOTIFICATION, NOTIFICATION_PREFERENCE. Gunakan uuid PK, relasi & FK benar (CLASH punya dua FK ke USER: reporter_id dan assignee_id nullable), enum untuk peran/kanal/tipe notifikasi, dan @@index pada CLASH(project_id, status_id, priority_id, discipline_id, zone_id, assignee_id, due_date, created_at).
3. Buat migrasi awal + script seed.ts: 1 project, master data (discipline ARS/STR/MEP + "Lainnya"; 3 zone; status Open/In Progress/Resolved/Closed dgn urutan & is_closed_state benar; priority Low/Medium/High/Critical dgn bobot), dan 4 user (satu per peran) + project_member-nya.
4. docker-compose.yml: PostgreSQL 16 + Redis 7, dengan env & volume.
5. NestJS: modul AppModule + HealthController (GET /health → {status:'ok'}), koneksi Prisma via PrismaService.
6. Next.js: halaman "/" placeholder + Tailwind terpasang.
7. Config: ESLint + Prettier + tsconfig strict di root & tiap app; GitHub Actions workflow (.github/workflows/ci.yml) yang menjalankan install, lint, test, build.

Tampilkan setiap file dengan path lengkap dan isi utuh. Sertakan README ringkas berisi langkah setup (pnpm install, docker compose up, prisma migrate, seed, dev). Jangan buat fitur bisnis apa pun di sprint ini.
```

---

## SPRINT 1 — Auth, RBAC & Administrasi

**Tujuan:** Login aman, kontrol akses berbasis peran, dan CRUD user/project/master data untuk Admin (Epik F).

**Deliverable:**
- Auth JWT (access + refresh), login/logout, hashing password (argon2/bcrypt).
- Guard & decorator RBAC di NestJS (`@Roles()`), plus scoping per proyek via PROJECT_MEMBER.
- Endpoint & UI Admin: CRUD user (buat/nonaktifkan, set peran), CRUD project & member, CRUD master data (discipline, zone, status, priority).
- Middleware proteksi route di Next.js + context user/peran.

**Acceptance (PRD US-F1):** Admin bisa buat/nonaktifkan user & set peran; RBAC ditegakkan (Management read-only, Engineer item sendiri, Coordinator kelola penuh); master data terkelola.

**Definition of Done:** 4 peran login dan melihat menu sesuai hak; endpoint non-authorized menolak dengan 401/403; test RBAC lulus.

### Prompt Sprint 1

```
[Tempel Master Context dulu. Lanjutan dari Sprint 0.]

TUGAS SPRINT 1 — Auth, RBAC & Administrasi.

Backend (NestJS):
1. AuthModule: register (admin-only), login (email+password), refresh token, logout. JWT access (15m) + refresh (7d, httpOnly cookie). Password hash pakai argon2.
2. RBAC: buat @Roles() decorator + RolesGuard yang membaca peran user dari JWT. Tambah ProjectMemberGuard untuk memastikan user adalah member proyek yang diakses. Aturan: Management = read-only global; Engineer = akses item yang ia report/assign; Coordinator = kelola penuh clash dalam proyeknya; Admin = semua administrasi.
3. UsersModule: CRUD user (create, list, update peran, deactivate). Hanya Admin.
4. ProjectsModule: CRUD project + kelola PROJECT_MEMBER (tambah/hapus member, set peran_proyek). Admin/Coordinator.
5. MasterDataModule: CRUD DISCIPLINE, ZONE (per project), STATUS, PRIORITY. Hanya Admin. Validasi: status wajib punya urutan unik & tepat satu chain; is_closed_state boleh >1.
6. DTO + class-validator untuk semua input. Unit test untuk RolesGuard & login.

Frontend (Next.js):
1. Halaman /login + form (validasi Zod), simpan sesi, redirect sesuai peran.
2. Auth context/provider + middleware proteksi route; sembunyikan menu sesuai peran.
3. Halaman Admin: /admin/users, /admin/projects, /admin/master-data — tabel + form CRUD memakai TanStack Table & komponen form reusable.

Tampilkan semua file baru/berubah dengan path lengkap dan kode utuh. Di akhir, tuliskan daftar endpoint + peran yang diizinkan sebagai tabel.
```

---

## SPRINT 2 — Input Clash/Issue & Lampiran (Epik A)

**Tujuan:** Engineer/Koordinator membuat clash/issue lewat form terstruktur dengan lampiran.

**Deliverable:**
- Endpoint create clash → generate `kode_unik`, status awal Open, timestamp, tulis AUDIT_LOG "created".
- Upload lampiran ke object storage (≥5 file, maks 10 MB/file, gambar/PDF) → simpan signed URL.
- Form input Next.js: judul, disiplin, zona/level, prioritas, deskripsi, lampiran drag-drop; validasi per field.
- Filter cepat "Reported by me" & "Assigned to me" (US-A2) — versi list sederhana (register penuh di Sprint 3).

**Acceptance (US-A1/A2):** Field wajib divalidasi; error jelas per field; lampiran sesuai batas; item langsung tampil dgn ID unik & timestamp.

**Definition of Done:** Clash tercipta dgn kode unik & audit log; lampiran tersimpan aman & bisa diunduh via signed URL; filter "milik saya" bekerja.

### Prompt Sprint 2

```
[Tempel Master Context dulu. Lanjutan dari Sprint 1.]

TUGAS SPRINT 2 — Input Clash/Issue & Lampiran (Epik A).

Backend (NestJS):
1. ClashesModule: POST /clashes (create). Generate kode_unik format {PROJECTCODE}-{disiplin}-{urut, 4 digit}. Set status = Open (dari STATUS), created_at, reporter_id = user login. Tulis AUDIT_LOG aksi "created".
2. Validasi DTO: judul (wajib), discipline_id, zone_id, priority_id (wajib, harus valid & milik project), deskripsi (wajib), due_date opsional. Hanya Engineer/Coordinator project member yang boleh create.
3. AttachmentsModule: presigned upload ke object storage S3-compatible. Batasi: maks 10 MB/file, tipe image/* atau application/pdf, minimal dukung 5 file. Simpan record ATTACHMENT (nama_file, url, tipe, ukuran_bytes, uploaded_by). GET lampiran mengembalikan signed URL temporer (mis. 15 menit).
4. GET /clashes?scope=reported_by_me|assigned_to_me — list ringkas milik user (status, prioritas, due_date).
5. Test: create clash membuat audit log; validasi ukuran/tipe file.

Frontend (Next.js):
1. Halaman /clashes/new: form terstruktur (judul, disiplin, zona/level, prioritas, deskripsi) + area drag-drop lampiran dengan preview, progress, dan pesan error per file. Validasi Zod, tampilkan error per field, disable submit jika invalid.
2. Setelah submit sukses → redirect ke detail (placeholder) atau list, tampilkan kode_unik.
3. Halaman /my-clashes: dua tab "Dilaporkan saya" & "Ditugaskan ke saya" (TanStack Table ringkas).

Tampilkan semua file dengan path lengkap dan kode utuh. Catat asumsi konfigurasi object storage (env var) di akhir.
```

---

## SPRINT 3 — Clash Register (Epik B1)

**Tujuan:** Register terpusat yang bisa difilter, disortir, dicari, dan skala hingga 10.000 baris.

**Deliverable:**
- Endpoint list clash dengan filter (disiplin, status, prioritas, assignee, zona, rentang tanggal), full-text search, sort per kolom, pagination server-side (cursor/offset).
- Query teroptimasi memakai indeks; join master data untuk label.
- UI Register: TanStack Table dengan header filter, sort, kolom link ke detail, pagination/virtual scroll, dan search bar.

**Acceptance (US-B1):** Filter multi-dimensi + sort + search bebas; responsif ≤1 detik hingga 10.000 baris; tiap baris menautkan ke detail.

**Definition of Done:** Register memuat data terfilter dari server; performa diuji dengan seed 10.000 clash; URL merefleksikan filter (shareable).

### Prompt Sprint 3

```
[Tempel Master Context dulu. Lanjutan dari Sprint 2.]

TUGAS SPRINT 3 — Clash Register (Epik B1).

Backend (NestJS):
1. GET /clashes dengan query params: projectId (wajib), q (search judul+kode+deskripsi), disciplineId[], statusId[], priorityId[], assigneeId[], zoneId[], dueFrom, dueTo, createdFrom, createdTo, sortBy, sortDir, page/limit ATAU cursor. Kembalikan data + total + info pagination.
2. Query pakai Prisma dengan WHERE dinamis; pastikan memakai indeks yang ada. Join discipline/zone/status/priority/assignee untuk label. RBAC: Management & Coordinator lihat semua di project; Engineer difilter ke item miliknya bila diminta.
3. Tambah script untuk generate 10.000 clash dummy guna uji performa. Sertakan EXPLAIN singkat/catatan indeks. Test: filter kombinasi mengembalikan hasil benar.

Frontend (Next.js):
1. Halaman /register: TanStack Table server-driven. Kolom: kode_unik, judul, disiplin, zona, status (badge warna), prioritas (badge), assignee, due_date (tandai overdue merah), created_at.
2. Panel filter: multi-select disiplin/status/prioritas/assignee/zona + date range + search box (debounce). Sort per kolom. Pagination server-side (atau virtual scroll).
3. Sinkronkan state filter ke URL query (shareable & back-button friendly). Setiap baris → link ke /clashes/[id].
4. Loading & empty states.

Tampilkan semua file dengan path lengkap dan kode utuh. Di akhir jelaskan strategi performa (indeks + pagination) dan hasil uji pada 10.000 baris.
```

---

## SPRINT 4 — Detail Item, Komentar, Audit & Triase (Epik C + B2)

**Tujuan:** Halaman rincian lengkap; koordinator men-triase (assign, prioritas, due date, transisi status) dengan audit trail penuh.

**Deliverable:**
- Endpoint detail clash (semua field, lampiran, komentar, audit log kronologis).
- Update clash: assign assignee, ubah prioritas/due date, transisi status (Open→In Progress→Resolved→Closed) dengan validasi urutan; set `closed_at` saat masuk status closed.
- Setiap perubahan menulis AUDIT_LOG (field, nilai lama→baru, actor, waktu).
- Tambah komentar; komentar & perubahan status memicu event notifikasi (dikirim di Sprint 5 — sediakan hook/queue publish).
- UI detail: panel field editable (sesuai peran), timeline audit, thread komentar, galeri lampiran.

**Acceptance (US-C1/B2):** Semua field, lampiran, komentar, audit tampil; perubahan status/assignee tercatat; notifikasi terpicu ke assignee saat assign.

**Definition of Done:** Transisi status valid & audit lengkap; RBAC edit ditegakkan; event notifikasi ter-publish ke queue.

### Prompt Sprint 4

```
[Tempel Master Context dulu. Lanjutan dari Sprint 3.]

TUGAS SPRINT 4 — Detail Item, Komentar, Audit & Triase (Epik C + B2).

Backend (NestJS):
1. GET /clashes/:id → detail lengkap: semua field + label master data, daftar ATTACHMENT (dengan signed URL), COMMENT (kronologis + author), AUDIT_LOG (kronologis).
2. PATCH /clashes/:id → ubah assignee_id, priority_id, due_date, status_id. Validasi transisi status memakai STATUS.urutan (tidak boleh lompat mundur kecuali Coordinator; konfigurasikan aturan sederhana & dokumentasikan). Saat status menjadi is_closed_state → set closed_at; saat keluar dari closed → reset. RBAC: Coordinator penuh; Engineer hanya jika assignee & terbatas (mis. Open→In Progress→Resolved).
3. Untuk SETIAP perubahan field, tulis satu baris AUDIT_LOG (aksi, field, nilai_lama, nilai_baru, actor_id). Immutable.
4. POST /clashes/:id/comments → tambah komentar.
5. Publish event ke queue (BullMQ) untuk: assigned, status_change (siapkan producer; consumer email dibuat Sprint 5). Jangan kirim email di sprint ini.
6. Test: transisi valid/invalid; audit tercatat per field; RBAC edit.

Frontend (Next.js):
1. Halaman /clashes/[id]: header (kode_unik, judul, status badge, prioritas). Panel kiri: field editable inline sesuai peran (assignee dropdown dari project member, prioritas, due date, status via stepper). Panel kanan/tab: Lampiran (galeri gambar + link PDF), Komentar (thread + input), Riwayat (timeline AUDIT_LOG "X mengubah Y dari A ke B, waktu").
2. Optimistic update + rollback bila gagal; toast notifikasi hasil.

Tampilkan semua file dengan path lengkap dan kode utuh. Dokumentasikan aturan transisi status yang kamu terapkan.
```

---

## SPRINT 5 — Notifikasi Email Async (Epik E1 — Email)

**Tujuan:** Kirim notifikasi email otomatis untuk assign, perubahan status, dan item overdue.

**Deliverable:**
- Worker BullMQ consumer: kirim email (SMTP/penyedia transaksional) untuk event assigned & status_change.
- Cron job harian mendeteksi clash overdue (due_date lewat & belum closed) → buat notifikasi overdue.
- Record NOTIFICATION per pengiriman (kanal=email, tipe, terkirim).
- Template email berisi kode clash, ringkasan, dan deep link ke item.

**Acceptance (US-E1):** Notifikasi terkirim saat assign, status berubah, dan overdue; isi memuat ID clash + ringkasan + tautan langsung.

**Definition of Done:** Email terkirim di lingkungan test (mailhog/penyedia sandbox); NOTIFICATION tercatat; retry pada kegagalan.

### Prompt Sprint 5

```
[Tempel Master Context dulu. Lanjutan dari Sprint 4.]

TUGAS SPRINT 5 — Notifikasi Email Async (Epik E1 — Email).

Backend (NestJS + BullMQ + Redis):
1. NotificationsModule dengan queue "notifications". Consumer mengonsumsi event assigned & status_change yang dipublish Sprint 4.
2. EmailService (nodemailer, konfigurasi SMTP via env; default MailHog untuk dev). Template HTML: subjek berisi kode_unik + tipe event; body berisi ringkasan clash, perubahan, dan deep link (WEB_BASE_URL/clashes/:id).
3. Untuk tiap pengiriman, buat record NOTIFICATION(user_id, clash_id, kanal='email', tipe, terkirim). Retry dengan backoff (3x) bila gagal; tandai terkirim=false bila gagal permanen.
4. Cron harian (mis. @Cron 07:00) OverdueScanner: cari CLASH dengan due_date < hari ini AND status bukan is_closed_state → enqueue notifikasi tipe 'overdue' ke assignee (skip yang sudah dinotifikasi hari itu).
5. Hormati bahwa preferensi kanal penuh dibuat Sprint 8; untuk sekarang email selalu aktif. Test: consumer memproses event → NOTIFICATION dibuat; overdue scanner memilih item benar.

Tampilkan semua file dengan path lengkap dan kode utuh. Sertakan instruksi menjalankan MailHog di docker-compose dan cara menguji end-to-end.
```

---

## SPRINT 6 — Dashboard Manajemen (Epik D)

**Tujuan:** Dashboard KPI read-only untuk manajemen dengan tren, sebaran, dan drill-down.

**Deliverable:**
- Endpoint agregasi teroptimasi (SQL agregat / materialized view): total clash, open vs closed, overdue, mean time to resolution, tren penyelesaian (time series), sebaran per disiplin/prioritas/zona.
- Caching hasil agregasi (Redis) + filter per project & rentang tanggal.
- UI Dashboard: kartu KPI, line/burndown chart, bar/pie sebaran (Recharts); klik segmen → navigasi ke Register terfilter (drill-down).

**Acceptance (US-D1/D2):** KPI + tren + sebaran tampil; dashboard read-only, muat ≤3 detik untuk 10.000 clash; klik segmen memfilter register.

**Definition of Done:** Angka KPI tervalidasi terhadap data seed; drill-down membuka Register dengan filter benar; performa ≤3 detik diuji.

### Prompt Sprint 6

```
[Tempel Master Context dulu. Lanjutan dari Sprint 4 (dan data dari Sprint 3).]

TUGAS SPRINT 6 — Dashboard Manajemen (Epik D).

Backend (NestJS):
1. DashboardModule endpoint GET /dashboard?projectId=&from=&to= mengembalikan: totalClash, openCount, closedCount, overdueCount, meanTimeToResolutionHari, resolutionTrend[] (per minggu: dibuat vs ditutup / burndown), byDiscipline[], byPriority[], byZone[].
2. Implementasi dengan SQL agregat efisien (memakai indeks). Untuk skala 10.000+ clash, gunakan materialized view atau tabel agregat yang di-refresh berkala + cache Redis (TTL). Mean time to resolution = rata-rata (closed_at - created_at) untuk item closed.
3. RBAC: Management, Coordinator, Admin boleh baca; read-only. Test: angka agregasi cocok dengan data seed.

Frontend (Next.js + Recharts):
1. Halaman /dashboard read-only: baris kartu KPI (total, open/closed, overdue, MTTR). LineChart tren penyelesaian/burndown. BarChart per disiplin & per zona; PieChart per prioritas.
2. Filter global: project selector + date range; state di URL.
3. Drill-down: klik segmen chart (mis. bar "MEP" atau slice "Overdue") → navigasi ke /register dengan query filter sesuai konteks.
4. Skeleton loading; pastikan render awal cepat.

Tampilkan semua file dengan path lengkap dan kode utuh. Jelaskan strategi agregasi/caching dan hasil uji performa ≤3 detik.
```

---

## SPRINT 7 — Export & Bulk Update (Epik E2 + B3)

**Tujuan:** Export laporan Excel/PDF sesuai filter aktif, dan update massal clash.

**Deliverable:**
- Export Excel (ExcelJS): kolom terstruktur, menghormati filter register aktif.
- Export PDF (pdfmake/Puppeteer): ringkasan KPI + tabel.
- Job export async untuk dataset besar (≤10 detik untuk 10.000 baris) + progress/download link.
- Bulk update: pilih banyak clash → ubah status/assignee/prioritas sekaligus, dengan konfirmasi + audit log per item.

**Acceptance (US-E2/B3):** Export menghormati filter; Excel terstruktur; PDF berisi KPI+tabel; ≤10 detik/10.000 baris; bulk update dengan konfirmasi.

**Definition of Done:** File export benar & terbuka; bulk update menulis audit per item; batas performa terpenuhi.

### Prompt Sprint 7

```
[Tempel Master Context dulu. Lanjutan dari Sprint 3 & 6.]

TUGAS SPRINT 7 — Export & Bulk Update (Epik E2 + B3).

Backend (NestJS):
1. ExportModule: POST /export/excel dan POST /export/pdf menerima SET FILTER yang sama dengan GET /clashes. 
   - Excel (ExcelJS): kolom kode_unik, judul, disiplin, zona, status, prioritas, reporter, assignee, due_date, created_at, closed_at; header ter-styling; freeze header.
   - PDF (pdfmake): halaman ringkasan KPI (reuse agregasi Sprint 6) + tabel item terfilter.
2. Untuk 10.000 baris, jalankan sebagai job async (BullMQ), simpan hasil ke object storage, kembalikan download URL saat selesai; target ≤10 detik. Endpoint status job.
3. BulkModule: PATCH /clashes/bulk dengan { ids[], perubahan: {status_id?, assignee_id?, priority_id?} }. Terapkan per item dengan validasi RBAC + transisi status; tulis AUDIT_LOG untuk tiap item. Kembalikan ringkasan sukses/gagal.
4. Test: export menghormati filter; bulk menulis audit per item; job selesai < target.

Frontend (Next.js):
1. Di /register: tombol "Export Excel" & "Export PDF" yang mengirim filter aktif; tampilkan progress lalu auto-download.
2. Checkbox pilih baris + toolbar bulk (ubah status/assignee/prioritas) dengan modal konfirmasi yang menampilkan jumlah item terdampak; tampilkan hasil (berapa berhasil/gagal).

Tampilkan semua file dengan path lengkap dan kode utuh. Sertakan sampel struktur Excel & layout PDF.
```

---

## SPRINT 8 — Notifikasi WhatsApp & Preferensi Kanal (Epik E1 — WA)

**Tujuan:** Tambah kanal WhatsApp dan biarkan user memilih kanal notifikasi.

**Deliverable:**
- Integrasi WhatsApp Business API (provider resmi) sebagai channel di worker notifikasi, dengan fallback email.
- CRUD NOTIFICATION_PREFERENCE (email_enabled, whatsapp_enabled) per user + UI pengaturan.
- Worker menghormati preferensi: kirim ke kanal aktif saja; catat NOTIFICATION per kanal.

**Acceptance (US-E1):** User mengatur preferensi kanal; notifikasi terkirim via kanal terpilih; fallback email bila WA gagal.

**Definition of Done:** WA terkirim di sandbox provider; preferensi dihormati; fallback bekerja; NOTIFICATION tercatat per kanal.

### Prompt Sprint 8

```
[Tempel Master Context dulu. Lanjutan dari Sprint 5.]

TUGAS SPRINT 8 — Notifikasi WhatsApp & Preferensi Kanal (Epik E1 — WA).

Backend (NestJS):
1. Tambah WhatsAppService memakai WhatsApp Business API (abstraksi provider via interface + env config; sediakan implementasi contoh untuk satu penyedia resmi, mis. Cloud API). Kirim template message berisi kode_unik + ringkasan + link.
2. NotificationPreferenceModule: GET/PUT preferensi per user (email_enabled, whatsapp_enabled). Default: email on, whatsapp off.
3. Ubah consumer notifikasi Sprint 5: untuk tiap event, cek preferensi user → kirim ke kanal aktif. Jika whatsapp_enabled tapi WA gagal → fallback email. Catat NOTIFICATION per kanal (terkirim true/false).
4. Test: preferensi dihormati; fallback saat WA gagal; NOTIFICATION per kanal.

Frontend (Next.js):
1. Halaman /settings/notifications: toggle Email & WhatsApp + input nomor WA (validasi format E.164). Simpan preferensi.

Tampilkan semua file dengan path lengkap dan kode utuh. Dokumentasikan env var provider WA dan cara uji di sandbox.
```

---

## SPRINT 9 — Bulk Import & Master Data Lanjutan (v2.0)

**Tujuan:** Mempercepat input dengan import CSV/XML hasil tool BIM (Navisworks/Solibri), dan master data lanjutan.

**Deliverable:**
- Import CSV/XML: upload → preview → mapping kolom ke field clash → validasi → commit batch (buat clash + audit "imported").
- Penanganan error baris (laporan baris gagal + alasan), idempotensi via kode eksternal opsional.
- Master data lanjutan: kelola template disiplin/zona lintas proyek, aktif/nonaktif master data.

**Acceptance:** File contoh Navisworks/Solibri ter-import dengan mapping; baris invalid dilaporkan tanpa membatalkan yang valid; audit tercatat.

**Definition of Done:** Import 1.000+ baris sukses dengan laporan error; master data lanjutan terkelola.

### Prompt Sprint 9

```
[Tempel Master Context dulu. Lanjutan dari Sprint 2.]

TUGAS SPRINT 9 — Bulk Import CSV/XML & Master Data Lanjutan (v2.0).

Backend (NestJS):
1. ImportModule: POST /import/preview (upload CSV atau XML export Navisworks/Solibri) → parse, kembalikan sampel baris + kolom terdeteksi. POST /import/commit dengan mapping kolom→field clash (judul, disiplin, zona, prioritas, deskripsi, dll).
2. Validasi per baris: master data harus cocok (map by kode/nama, buat opsi auto-create bila diizinkan Admin). Baris valid dibuat sebagai CLASH (status Open, reporter = importer) + AUDIT_LOG "imported"; baris invalid dikumpulkan ke laporan error (nomor baris + alasan) tanpa membatalkan transaksi lain. Proses sebagai job async untuk file besar.
3. Idempotensi opsional: jika file punya kolom external_id, simpan & lewati duplikat.
4. Master data lanjutan: endpoint aktif/nonaktif discipline/zone; template master data yang bisa disalin antar project.
5. Test: import file campuran valid+invalid; laporan error akurat; dedup by external_id.

Frontend (Next.js):
1. Halaman /import: wizard 3 langkah — upload → mapping kolom (dropdown per kolom) → preview & commit. Tampilkan progress + laporan hasil (X sukses, Y gagal dengan detail).
2. UI master data lanjutan: toggle aktif/nonaktif + salin template.

Tampilkan semua file dengan path lengkap dan kode utuh. Sertakan contoh format CSV & XML yang didukung.
```

---

## SPRINT 10 — Kandidat Fitur AI (v2.0, opsional)

**Tujuan:** Menambah bantuan AI (auto-kategorisasi/prioritisasi & deteksi duplikat) DENGAN strategi evaluasi wajib dan human-in-the-loop, sesuai Bagian 3 PRD.

**Deliverable:**
- Auto-kategorisasi: sarankan disiplin/prioritas dari teks judul+deskripsi (LLM/klasifikasi) — sebagai SARAN, bukan otomatis final.
- Deteksi duplikat: saat input, cari clash mirip (embedding/similaritas) dan tampilkan kandidat duplikat.
- Eval harness: dataset berlabel, metrik akurasi (precision/recall), threshold minimum sebelum aktif, dan mekanisme human-in-the-loop (user konfirmasi saran).

**Acceptance (PRD Bagian 3):** Fitur AI disertai benchmark berlabel + target akurasi + human-in-the-loop sebelum rilis.

**Definition of Done:** Saran muncul di UI sebagai rekomendasi (bisa ditolak); laporan eval terpenuhi threshold; tidak ada aksi otomatis tanpa konfirmasi.

### Prompt Sprint 10

```
[Tempel Master Context dulu. Lanjutan dari Sprint 2 & 6.]

TUGAS SPRINT 10 — Kandidat Fitur AI (v2.0). CATATAN: fitur bersifat SARAN + human-in-the-loop; tidak boleh mengambil keputusan otomatis tanpa konfirmasi user.

Backend (NestJS):
1. AiModule (abstraksi provider via interface, konfigurasi via env — jangan hardcode vendor).
   a. Auto-kategorisasi: endpoint POST /ai/suggest-category { judul, deskripsi } → { disciplineSuggestion, prioritySuggestion, confidence }. 
   b. Deteksi duplikat: saat create/preview clash, POST /ai/find-duplicates { judul, deskripsi, projectId } → daftar clash mirip (skor similaritas via embedding + cosine; simpan embedding di kolom vektor/tabel terpisah).
2. Eval harness: script yang menjalankan model terhadap dataset berlabel (sediakan format + contoh kecil), hitung precision/recall/accuracy, dan GATE: fitur hanya "enabled" bila metrik ≥ threshold yang dikonfigurasi. Simpan laporan eval.
3. Semua saran dicatat; keputusan final tetap milik user (audit mencatat apakah saran diterima/ditolak).

Frontend (Next.js):
1. Di form input (/clashes/new): saat user mengetik judul/deskripsi, tampilkan chip saran disiplin/prioritas (bisa diterima 1-klik atau diabaikan) + panel "Kemungkinan duplikat" dengan link ke clash mirip.

Tampilkan semua file dengan path lengkap dan kode utuh. Sertakan contoh dataset eval, definisi metrik, dan nilai threshold default. Jangan aktifkan fitur secara default sebelum eval lulus.
```

---

## SPRINT 11 — Hardening, Performa & Deploy

**Tujuan:** Menyiapkan produksi: performa, keamanan, observability, dan deployment.

**Deliverable:**
- Uji beban register/dashboard/export pada 10.000 clash; tuning indeks/query/cache hingga target NFR terpenuhi.
- Keamanan: audit RBAC menyeluruh, signed URL lampiran, rate limiting, header keamanan, validasi input, dependency scan; backup DB terjadwal.
- Observability: logging terstruktur, error tracking (mis. Sentry), health/readiness probe, metrik.
- Deploy: containerize, env produksi, object storage, CI/CD ke cloud; uptime target ≥99,5%.

**Acceptance (PRD 4.5/4.6):** Semua NFR (dashboard ≤3s, register ≤1s, export ≤10s, uptime ≥99,5%) terverifikasi; audit trail immutable; akses lampiran aman.

**Definition of Done:** Laporan uji beban memenuhi target; checklist keamanan lulus; aplikasi ter-deploy & sehat di lingkungan produksi/staging.

### Prompt Sprint 11

```
[Tempel Master Context dulu. Lanjutan dari semua sprint sebelumnya.]

TUGAS SPRINT 11 — Hardening, Performa & Deploy.

1. Performa: buat skrip uji beban (k6/Artillery) untuk GET /clashes (filter berat), GET /dashboard, dan export pada dataset 10.000+ clash. Ukur p95; tuning indeks, query Prisma, materialized view, dan caching Redis sampai memenuhi: register ≤1s, dashboard ≤3s, export ≤10s. Laporkan angka sebelum/sesudah.
2. Keamanan: audit seluruh endpoint memastikan RBAC + ProjectMemberGuard; pastikan lampiran hanya via signed URL temporer; tambah rate limiting, helmet/security headers, CORS ketat, validasi & sanitasi input; konfirmasi AUDIT_LOG immutable (tanpa route update/delete). Tambah dependency & secret scan di CI. Jadwalkan backup PostgreSQL + kebijakan retensi.
3. Observability: logging terstruktur (pino), integrasi error tracking (Sentry), endpoint /health & /ready, metrik dasar (Prometheus opsional).
4. Deploy: Dockerfile produksi untuk web & api, docker-compose/manifest untuk staging, konfigurasi object storage & env produksi, pipeline CI/CD (build → test → deploy). Dokumentasikan langkah rollback.

Tampilkan semua file (skrip uji, Dockerfile, workflow, config) dengan path lengkap dan kode utuh. Sertakan checklist keamanan & laporan hasil uji beban terhadap target NFR.
```

---

## Catatan Penutup

- **Urutan wajib** untuk MVP tercepat: Sprint 0 → 1 → 2 → 3 → 4 → 5. Setelah ini, spreadsheet sudah bisa ditinggalkan (nilai inti MVP tercapai).
- **v1.1** (visibilitas manajemen): Sprint 6 → 7 → 8.
- **v2.0** (efisiensi & wawasan): Sprint 9 → 10, lalu **Sprint 11** sebelum rilis produksi (idealnya sebagian hardening dilakukan lebih awal jika sudah go-live di MVP).
- Tiap prompt sengaja membatasi scope agar model Sonnet tidak "melebar". Selalu jalankan **Definition of Done** tiap sprint sebelum lanjut.
- Jika ingin, prompt bisa dipecah lebih halus lagi (mis. Sprint 3 dipisah backend-query dan frontend-table) bila satu prompt terlalu besar untuk satu sesi.
```