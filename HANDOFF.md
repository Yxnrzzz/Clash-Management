# EPS Workspace — Handoff Progress

**Tanggal:** 6 Agustus 2026 (update ke-13)
**Status:** Frontend selesai. **Sprint 0-9 backend selesai, Sprint 11 sebagian besar selesai** (Sprint 10/AI opsional masih belum, sengaja ditunda — lihat §7/§12), produk sekarang bernama **EPS Workspace** (rebrand dari "ClashHub", lihat update ke-13), dan **benar-benar multi-project** (di luar 12 sprint asli — permintaan ad-hoc, lihat update ke-12 di bawah): auth, RBAC (termasuk **assignee kini dibatasi Engineer aktif saja**, lihat update ke-13), CRUD user/proyek/master-data, clash/komentar/audit log, lampiran, notifikasi email+WhatsApp, **impor massal CSV/XML async + template master data antar proyek**, **hardening keamanan + observability + uji beban 10.000 clash terukur nyata**, dan **otorisasi per-proyek yang ditegakkan server-side** (bukan lagi "single-project, semua user otomatis anggota") semuanya berjalan di NestJS + PostgreSQL + Redis (+ disk lokal untuk file) dengan RBAC ditegakkan server-side. **Tidak ada lagi apa pun yang client-only** — `localStorage` sudah pensiun total.

**Update ke-13 (assignee Engineer-only + rebrand "EPS Workspace", permintaan ad-hoc di luar Sprint Plan asli):** Dua perubahan independen dalam satu sesi.
(1) **Assignee sekarang dibatasi Engineer aktif saja** (sebelumnya Engineer *atau* Coordinator boleh, dan yang lebih penting: backend **tidak memvalidasi `assigneeId` sama sekali**). Validator baru `ClashesService.assertAssigneeIsEngineer()` (`null`/`undefined` selalu lolos — melepas assignee tetap boleh; selain itu user harus ada, `role === ENGINEER`, dan `isActive`) dipanggil dari **dua** jalur terpisah: `buildAllowedPatch()` (`PATCH /clashes/:id`) dan `bulkUpdate()` (`POST /clashes/bulk`) — yang kedua ini penting karena `bulkUpdate()` **tidak pernah** memanggil `buildAllowedPatch()`, jadi sebelum perubahan ini bulk-assign benar-benar tanpa penjagaan sama sekali, bukan cuma aturan yang lebih longgar. Frontend: predikat assignable yang tadinya terduplikasi identik di `RegisterView.tsx` dan `clashes/[id]/page.tsx` (`u.isActive && (peran Engineer atau Coordinator)`) disatukan jadi `isAssignable()` di `src/lib/lookup.ts`. Chip filter Assignee di Register juga dipersempit ke Engineer saja (`assigneeOptions`, tidak ada lagi Coordinator/Management/Admin di daftar) — keputusan awal sesi ini adalah membiarkannya tampil semua (pola soft-delete di §5: form tulis hanya opsi valid, filter baca tetap semua), tapi diralat atas permintaan eksplisit user karena sejak migrasi data di bawah **tidak ada lagi** clash dengan assignee non-Engineer, jadi opsi Coordinator/Management/Admin di filter ini tidak akan pernah match apa pun — Engineer nonaktif tetap ditampilkan (label `(nonaktif)`, pola sama dengan `priorityOptions`/`zoneOptions`) supaya clash historis yang di-assign ke Engineer yang sudah nonaktif tetap bisa dicari. Data lama diperbaiki lewat migrasi data-only `20260806120000_null_non_engineer_assignees` (assignee non-Engineer di-`NULL`-kan) — **tanpa** baris `AuditLog` karena `actorId` adalah FK wajib dan tidak ada aktor jujur untuk migrasi sistem (memakai reporter atau admin acak = memalsukan riwayat); efeknya cukup terlihat dari row count `migrate deploy` dan diverifikasi ulang lewat query Prisma langsung (`0` clash dengan assignee non-Engineer setelah migrasi+seed). Seed (`seed.ts`, `seed-load-test.ts`) diperbarui supaya data baru selalu lahir bersih. Terverifikasi lengkap: dropdown assignee di detail & bulk-assign cuma menampilkan Engineer aktif; **dan** `fetch()` langsung dari console browser ke `PATCH /clashes/:id`/`POST /clashes/bulk` dengan `assigneeId` milik Coordinator (melewati UI sepenuhnya) → `400 Bad Request`, membuktikan aturan ditegakkan server-side, bukan cuma disembunyikan di client. Sekaligus diverifikasi ulang (tanpa kode baru) bahwa **Management** dan **Coordinator** — bukan cuma Admin/Engineer yang sudah dibuktikan sebelumnya — benar-benar bisa lintas-proyek: switcher menampilkan MCA & GSB untuk keduanya, dan Dashboard+Register berganti isi saat proyek ditukar (MCA 91 clash ↔ GSB 12 clash), tidak ada yang tersumbat. Detail RBAC di §6.
(2) **Rebrand "ClashHub" → "EPS Workspace"**, lingkup **UI + dokumentasi saja**: judul tab (`layout.tsx`), sidebar (`AppShell.tsx`), halaman login (logo alt + `<h1>`, **dan subtitle penjelasan "Web platform manajemen clash & issue koordinasi BIM" dihapus** — permintaan eksplisit, bukan cuma rename), splash loading (`page.tsx`), header PDF export, nama file export Excel/PDF (`eps-workspace-register-*`), nama file contoh import CSV/XML, display-name email pengirim (`SMTP_FROM`, alamat `noreply@clashhub.dev` **tetap** — cuma display-name yang berubah), `README.md`/`apps/api/README.md`/`HANDOFF.md` ini. **Sengaja TIDAK diubah** (keputusan sadar, bukan kelupaan — jangan "dirapikan" di sesi berikutnya): nama database `clashhub_db`/user `clashuser` di `DATABASE_URL` + kedua `docker-compose*.yml` (butuh drop/recreate DB); volume Docker `clashhub-postgres-data`/`clashhub-redis-data`/`clashhub-uploads` (data & upload jadi yatim kalau di-rename); cookie `clashhub_refresh` (semua sesi ter-logout); localStorage key `clashhub:activeProjectId` (pilihan proyek aktif ter-reset); email seed `@clashhub.dev` + tombol demo di halaman login (keduanya harus sinkron — mengubah salah satu tanpa yang lain memutus login demo); nama paket `clashhub-web`/`clashhub-api` di `package.json`+lockfile+`.claude/launch.json`+`container_name` Docker; fixture email di semua `*.spec.ts` dan `load-test/common.js`; metadata SEO `description` di `layout.tsx` (permintaan #4 spesifik ke halaman login, ini tidak tampil di halaman manapun); `public/logo.png` (grafis murni, tidak ada wordmark teks di dalamnya, sudah dicek). Dokumen sumber `ClashHub_PRD.md`/`ClashHub_ERD.md`/`ClashHub_Sprint_Plan.md` **tidak diubah dan tidak di-rename** — dokumen historis, ditulis sebelum rebrand, dan me-rename filenya akan memutus glob `ClashHub_*.md` di `.dockerignore`; cukup dicatat di sini bahwa nama produk berubah setelah dokumen-dokumen itu ditulis. Verifikasi otomatis (backend 103 test/12 suite [96 lama + 7 baru], frontend 36 test [31 lama + 5 baru], build & lint bersih di kedua sisi, baseline warning tidak berubah) dan live browser (screenshot login/sidebar menampilkan "EPS Workspace", subtitle hilang) — lihat §12 untuk baseline lama yang dibandingkan.

**Update ke-14 (buat proyek baru dari UI, di luar Sprint Plan asli):** Sebelum sesi ini, tidak ada cara membuat proyek baru selain lewat Prisma/seed langsung — `/admin/projects` cuma bisa rename proyek aktif dan kelola anggota, dan menampilkan pesan eksplisit "buat proyek baru lewat database/seed" kalau `projects.length === 0`. Sekarang ada `POST /projects` (Admin-only, `CreateProjectDto { name, code }` — `code` 2-6 karakter alfanumerik, di-uppercase & di-trim, harus unik lewat `ProjectsService.create()`, `409` kalau `code` sudah dipakai) + form "Buat Proyek Baru" di `/admin/projects` (`createProject()` baru di `data-context.tsx`, pola sama dengan `createUser`). Proyek baru lahir **kosong** (tanpa `Discipline`/`Zone`/`ProjectMember` — `Priority`/`Status` global otomatis ikut) dan **langsung jadi proyek aktif** di frontend supaya admin bisa lanjut setup: salin disiplin/zona lewat `POST /master-data/templates/copy` yang sudah ada (dialog "Salin dari proyek lain" di `/admin/master-data`), lalu tambah anggota lewat form yang sudah ada di halaman yang sama. 2 unit test baru (`projects.service.spec.ts`, file baru — sebelumnya tidak ada test untuk `ProjectsService` sama sekali): create sukses dengan normalisasi kode, dan `409` untuk kode duplikat. Terverifikasi live: login Admin, buat proyek baru dari form, proyek langsung muncul di switcher sidebar dan jadi aktif, klik "Salin dari proyek lain" + tambah anggota berhasil.

**Update ke-12 (multi-project authorization, di luar Sprint Plan asli):** Sebelum sesi ini, `ProjectMemberGuard` memang ada tapi **tidak pernah dipasang di rute mana pun** (lihat riwayat di §5 "Koreksi ProjectMemberGuard") dan setiap service memakai `currentProject()` = "proyek tertua" — artinya ClashHub secara runtime terkunci ke satu proyek meski schema Prisma (`Project`/`ProjectMember`) sudah dirancang multi-project sejak awal. Sekarang: guard baru `ProjectContextGuard` (menggantikan `ProjectMemberGuard`, file lama dihapus) dipasang **global** sebagai `APP_GUARD` — membaca header `X-Project-Id`, deny-by-default (WAJIB ada header kecuali rute ditandai `@SkipProjectScope()`), dan menaruh `projectId` terverifikasi di `request.activeProjectId` lewat decorator `@ActiveProject()`. Role ADMIN/MANAGEMENT/COORDINATOR bypass cek keanggotaan (`CROSS_PROJECT_ROLES` di `common/constants/project-roles.ts`) — **hanya ENGINEER** yang benar-benar dibatasi ke proyek yang di-assign lewat `ProjectMember`. Setiap query per-proyek (clash, disiplin, zona, import job) sekarang di-scope oleh `projectId` ini, bukan "proyek tertua" lagi; resource-level check baru (`assertClashInProject`) mengembalikan 404 (bukan 403) untuk clash yang ada tapi bukan di proyek aktif, supaya tidak bocor keberadaan data proyek lain. Frontend dapat project switcher sungguhan (sebelumnya dropdown yang selalu `disabled`) di sidebar `AppShell.tsx` dan Dashboard, plus UI kelola anggota proyek baru di `/admin/projects`. Seed sekarang punya **dua** proyek (`proj-1`/MCA yang lama + `proj-2`/GSB baru, 12 clash, 3 anggota) untuk membuktikan isolasi. Detail lengkap di §5 "Otorisasi multi-project (update ke-12)". **Update ke-11 (Sprint 11 — Hardening, Performa & Observability):** helmet, rate limiting (global 600/menit per IP + `/auth/login` 5/menit, diverifikasi live), global exception filter (Prisma error dipetakan ke status HTTP yang benar, tidak bocor ke client), validasi env Joi saat boot (gagal cepat dengan pesan jelas, bukan gagal senyap di query pertama), refresh token *versioned* (logout benar-benar meng-invalidate token lama, bukan cuma hapus cookie browser), gap RBAC nyata di download lampiran diperbaiki (ditemukan: `ProjectMemberGuard` ternyata tidak pernah dipasang di rute mana pun sejak awal — lihat §5 "Koreksi ProjectMemberGuard"), logging terstruktur (pino, redact token/cookie), Sentry opsional (no-op tanpa `SENTRY_DSN`), `GET /health/ready` (DB+Redis, terpisah dari `/health` yang cuma DB), kredensial demo hilang dari bundle produksi (dead-code elimination via `NODE_ENV`, bukan env var baru), `npm audit`+`gitleaks` di CI. Uji beban k6 sungguhan terhadap 10.091 clash (proyek demo + 10rb baris bertanda `externalId: 'loadtest-*'`, sepenuhnya reversibel, sudah dibuktikan) — **ketiga target NFR PRD lolos nyaman**: Register p95=88ms (target 1000ms), Dashboard p95=167ms (target 3000ms), Export p95=1.03s (target 10s); index tambahan & refactor `metrics()` ke SQL dievaluasi lewat `EXPLAIN ANALYZE` dan **tidak** ditambahkan karena tidak ada bukti manfaat di skala target — didokumentasikan sebagai keputusan sadar, bukan diabaikan. **Deploy ke host nyata sengaja tidak dikerjakan** (tidak ada target infrastruktur) — hanya artefak & dokumentasi (`docker-compose.prod.yml` sudah ada dari Tahap A, `scripts/backup-db.sh` baru & terverifikasi, dokumen deploy/rollback baru di §13). Detail lengkap di §12. **Update ke-10 (Tahap A — menutup utang infrastruktur Sprint 0):** ditemukan bahwa `npm --prefix apps/api run lint` gagal total sejak awal proyek (`apps/api` tidak pernah punya `eslint.config.mjs`) — sekarang ada (`apps/api/eslint.config.mjs`, flat config ESLint 10 + typescript-eslint), lint backend **hijau** (0 error, 6 warning bawaan `fast-xml-parser` yang untyped) setelah memperbaiki 5 temuan nyata (unused import di `clashes.service.ts`, double-cast berlebih & floating promise di `import.processor.ts`/`main.ts`, `no-base-to-string` di `xml.parser.ts`, async-tanpa-await di `whatsapp.service.ts`) — 79 test backend tetap lulus setelahnya. Ditambahkan `.github/workflows/ci.yml` (job `web`/`api`/`docker`, belum pernah jalan sungguhan di GitHub karena belum di-push) dan Dockerfile produksi (`Dockerfile` root + `apps/api/Dockerfile`, multi-stage, image non-root) — **keduanya sudah dibangun dan dijalankan lokal di sesi ini** (web: `server.js` boot dan `/login` merespons 200; api: Nest app boot penuh sampai semua module ter-inisialisasi). Worktree nyasar `.claude/worktrees/fervent-gauss-19c30b` yang membuat `npm run lint` root melaporkan ribuan error palsu sudah dihapus (`git worktree remove`), dan `.claude/**` ditambahkan ke ignore lint root sebagai sabuk pengaman. `apps/api/.env.example` sekarang ter-track git (sebelumnya tertelan `.gitignore`'s `.env*`). Lihat §12 untuk detail lengkap & yang masih di luar scope (uji beban, hardening keamanan). **Update ke-9:** Sprint 9 backend (`ImportModule`: `/import/preview`+`/import/commit`+`/import/jobs/:id` via BullMQ, parser CSV & XML/Navisworks/Solibri, dedup by `externalId`, auto-create master data Admin-only) dan `POST /master-data/templates/copy` selesai + 31 unit test baru (79 total) + terverifikasi live lewat browser (upload → mapping → commit → progress → audit log `"imported"` → dedup re-import → error report → auto-create sebagai Admin → import XML). Menemukan & memperbaiki satu bug nyata di jalur ini: frontend `auditText()` belum punya case untuk action `"imported"`, hasilnya `"Priadi mengubah dari \"undefined\" ke \"undefined\""` — lihat §5 "Impor massal" dan §9. **Update ke-8:** Sprint 5/8 (notifikasi email+WhatsApp async) yang di update ke-7 baru lolos unit test, sekarang **sudah diverifikasi end-to-end dengan Redis/MailHog/Postgres benar-benar hidup** (Docker bisa diakses di sesi ini, beda dari sesi sebelumnya) — assign clash → email masuk MailHog, ubah status → email ke assignee+reporter, toggle WhatsApp di preferensi → baris `Notification(channel=WHATSAPP, isSent=true)` tanpa fallback email, `OverdueScannerService.scan()` dijalankan manual 2x lewat `NestFactory.createApplicationContext` → 44 notifikasi baru lalu 0 di run kedua (dedup harian bekerja). Detail lengkap ada di §5 "Notifikasi async" (tidak berubah) — hanya status verifikasi yang naik dari "belum" ke "sudah". **Update ke-7** (sebelumnya): Sprint 5 (email async via BullMQ+MailHog) dan Sprint 8 (WhatsApp mock + preferensi kanal via API) selesai — lihat §5 "Notifikasi async: email (MailHog) + WhatsApp (mock)". **Update ke-6** (sebelumnya): lampiran (`Attachment`) pindah dari client-only/sesi-only ke object storage nyata di server (`StorageService`, disk lokal, S3/R2-ready) — lihat §5 "Lampiran: object storage lokal", juga menghilangkan batasan lama "pratinjau tidak tersedia setelah reload".
**Lokasi proyek:** `D:\WebApp`

Dokumen ini untuk melanjutkan pengerjaan di sesi/chat baru. Baca ini dulu sebelum menulis kode.

> **Menjalankan sekarang butuh DUA server:** API di `localhost:3001` (`npm --prefix apps/api run start:dev`) dan web di `localhost:3000` (`npm run dev`). Keduanya terdaftar di `.claude/launch.json`. Tanpa API hidup, login gagal dan seluruh master data kosong.

---

## 1. Konteks

EPS Workspace (nama sebelumnya "ClashHub" — lihat update rebrand di bawah) adalah web platform manajemen clash & issue koordinasi BIM. Dokumen sumber ada di repo (ditulis sebelum rebrand, masih memakai nama "ClashHub" di judul/isi — file **tidak** di-rename, lihat alasan di bawah):

| Dokumen | Isi |
|---|---|
| `ClashHub_PRD.md` | Product Requirements — persona, user story, acceptance criteria, NFR |
| `ClashHub_ERD.md` | Entity Relationship Diagram (PostgreSQL) |
| `ClashHub_Sprint_Plan.md` | 12 sprint (0–11) + prompt siap-pakai per sprint |

**Update ke-5 (server-side pagination + agregasi dashboard):** `GET /clashes` menerima query params (`q`, `disc`/`stat`/`prio`/`zone`/`assignee`, `reporterId`, `cf`/`ct`, `overdue`, `sort`, `dir`, `page`, `pageSize`) dan mengembalikan `{ data, total }` — filter/sort/pagination Register sekarang dihitung Prisma, bukan array JS di browser. Endpoint baru `GET /clashes/metrics` menghitung KPI/tren mingguan/sebaran dashboard di server (port dari `computeMetrics()` di `dashboard-metrics.ts`), jadi `DashboardView` tidak lagi butuh seluruh array clash. Konsekuensi arsitektur: `DataContext` **berhenti memuat semua clash di bootstrap** — `master.clashes` (array) diganti `master.clashesById` (cache kecil, terisi on-demand oleh `loadClashDetail`/`createClash`/`updateClashField`). Register, Dashboard, dan "Clash Saya" masing-masing fetch sendiri dari `/clashes`; hanya halaman detail clash yang masih memakai `clashesById`. Lihat §5 "Clashes tidak lagi di-bulk-load" untuk detail lengkap.

**Update sejak handoff ke-3 (`ClashesModule`):** clash, komentar, dan audit log pindah dari `localStorage` ke NestJS + PostgreSQL. Backend baru: `apps/api/src/clashes/` (`ClashesController`/`ClashesService`/DTO) dengan 6 endpoint (list, detail, create, update, bulk update, comment) dan RBAC penuh di service layer — bukan cuma `@Roles()` — termasuk aturan "Engineer hanya boleh edit item sendiri" dan "Engineer hanya boleh maju status 1 langkah, tidak boleh menutup". Audit log dan `uniqueCode` sekarang dibuat server-side (tidak bisa dipalsukan client). Index `Clash` yang tadinya satu composite 8-kolom diganti 4 index yang benar-benar dipakai. Frontend: `data-context.tsx` tidak lagi menyimpan clash/komentar/audit di localStorage; `mock-data.ts` **dihapus total**; `localStorage` sekarang hanya berisi lampiran (sesi-only) dan preferensi notifikasi.

**Update sebelumnya (handoff ke-2/3, Sprint 1):** backend NestJS di `apps/api/` jadi backend resmi. AuthModule (JWT access 15m + refresh 7d di cookie `httpOnly`, password argon2id), `RolesGuard` + `@Roles()` + `ProjectMemberGuard` (klaim "benar-benar dipakai oleh route clash" di sini ternyata **tidak akurat** — dikoreksi di update ke-11, lihat §5 "Koreksi ProjectMemberGuard"), modul `users`/`projects`/`master-data`. Frontend punya lapisan `src/lib/api/`.

Sebelumnya (handoff ke-2): seluruh deliverable frontend dibangun — Admin panel, bulk update + export Excel/PDF, Pengaturan Notifikasi, wizard Import CSV, dan master data yang mutable.

---

## 2. Tech stack aktual

**Frontend** (root, port 3000)
```
Next.js 16.2.12 (App Router, Turbopack)  ·  React 19.2.4  ·  TypeScript strict
Tailwind CSS 4  ·  TanStack Table 8  ·  Recharts 3.10  ·  Zod 4
xlsx (SheetJS)  ·  jspdf + jspdf-autotable
```

**Backend** (`apps/api/`, port 3001, prefix `/api`)
```
NestJS 11  ·  Prisma 6  ·  PostgreSQL 16 (Docker)  ·  passport-jwt + @nestjs/jwt
@node-rs/argon2  ·  class-validator  ·  Jest
```

Redis 7 ada di `docker-compose.yml` tapi **belum dipakai** — BullMQ baru relevan di Sprint 5 (notifikasi async).

`@node-rs/argon2` dipakai, bukan paket `argon2`, karena mendistribusikan binary prebuilt sehingga tidak butuh node-gyp/Build Tools di Windows.

---

## 3. Struktur file

```
src/
├── app/
│   ├── layout.tsx              DataProvider → AuthProvider → AppShell (urutan penting, lihat §5)
│   ├── page.tsx                redirect / → /register atau /login
│   ├── login/page.tsx
│   ├── register/page.tsx       → RegisterView (filter, sort, bulk update, export)
│   ├── dashboard/page.tsx      → DashboardView
│   ├── my-clashes/page.tsx
│   ├── import/page.tsx         wizard CSV: upload → mapping → preview & commit
│   ├── settings/notifications/page.tsx
│   ├── admin/
│   │   ├── users/page.tsx      CRUD user + toggle aktif + ubah peran
│   │   ├── projects/page.tsx   edit nama/kode proyek AKTIF + kelola anggota proyek
│   │   │                       (tambah/hapus, update ke-12 — sebelumnya single-project,
│   │   │                       "anggota" cuma hitung semua user aktif; lihat §5)
│   │   └── master-data/page.tsx  tab Disiplin/Zona/Prioritas/Status
│   └── clashes/
│       ├── new/page.tsx        form input + upload lampiran SUNGGUHAN (File asli, object URL)
│       └── [id]/page.tsx       detail, triase, komentar, audit trail, pratinjau lampiran
├── components/
│   ├── AppShell.tsx             sidebar + nav (nav & menu Admin difilter per peran) + project
│   │                             switcher SUNGGUHAN (update ke-12 — sebelumnya cuma teks nama
│   │                             proyek, tidak pernah dropdown fungsional)
│   ├── Badge.tsx
│   ├── register/
│   │   ├── RegisterView.tsx     filter/sort/pagination server-side (fetch /clashes per
│   │   │                        perubahan filter, debounced); export fetch semua-cocok on-demand
│   │   ├── FilterChips.tsx      chip group (memoized)
│   │   └── BulkToolbar.tsx      toolbar bulk update + modal konfirmasi
│   └── dashboard/
│       ├── DashboardView.tsx    fetch /clashes/metrics (server hitung KPI/tren/sebaran)
│       ├── ChartPieces.tsx
│       └── viz-tokens.ts
└── lib/
    ├── api/                      LAPISAN BARU (Sprint 1)
    │   ├── client.ts             apiFetch/apiGet/apiPost/apiPatch, login, logout,
    │   │                         restoreSession. Access token disimpan DI MEMORI
    │   │                         (bukan localStorage). Retry sekali lewat /auth/refresh saat 401.
    │   ├── mappers.ts            SATU-SATUNYA tempat terjemahan Inggris ↔ Indonesia
    │   └── types.ts              bentuk respons API mentah (name/role/weight/sequence)
    ├── types.ts                 tipe domain — TIDAK BERUBAH sejak Sprint 1
    ├── dashboard-metrics.ts      computeMetrics() TIDAK DIPAKAI DashboardView lagi (server yang
    │                             hitung sejak update ke-5) — sengaja dipertahankan sbg fungsi
    │                             murni untuk unit test (lihat §12); resolveRange/RANGE_PRESETS
    │                             masih dipakai untuk UI range picker & WEEK_LABEL diekspor utk mappers.ts
    ├── data-context.tsx          master data dari API; clashesById (BUKAN array, lihat §5) sbg
    │                             cache kecil on-demand utk clash; hanya lampiran & preferensi
    │                             notifikasi yang masih localStorage (lihat §5). Sejak update
    │                             ke-12: `projects: Project[]` + `setActiveProject()` (proyek
    │                             AKTIF dipersist di localStorage key `clashhub:activeProjectId`
    │                             — ini BEDA dari key `clashhub-data-v5` di atas, jangan disamakan)
    ├── auth-context.tsx          auth ASLI — login/refresh/logout ke API
    ├── use-master-data.ts        hook lookup (disciplineById dst.) terikat ke array live
    ├── use-require-auth.ts       guard route (login wajib)
    ├── use-require-admin.ts      guard route (Admin-only, redirect ke /register)
    ├── lookup.ts                 helper murni: format tanggal/bytes, canEditClash, canComment
    ├── dashboard-metrics.ts       agregasi KPI/tren/sebaran (nerima master data sbg parameter)
    ├── export.ts                  exportClashesToExcel, exportClashesToPdf
    └── csv.ts                     parser CSV minimal untuk wizard import

apps/api/src/
├── main.ts                       setGlobalPrefix('api') + cookieParser + ValidationPipe
├── app.module.ts                 JwtAuthGuard, RolesGuard, & ProjectContextGuard (update ke-12)
│                                 didaftarkan sbg APP_GUARD global, urutan ini penting (lihat §5)
├── auth/                         login/refresh/logout/me, JwtStrategy, AuthService
├── common/
│   ├── decorators/               @Public(), @Roles(), @CurrentUser(), @SkipProjectScope() +
│   │                             @ActiveProject() (keduanya baru, update ke-12)
│   ├── guards/                   JwtAuthGuard, RolesGuard, ProjectContextGuard (update ke-12 —
│   │                             menggantikan ProjectMemberGuard yang dihapus total, bukan lagi
│   │                             cuma didefinisikan-tapi-tidak-dipasang; lihat §5)
│   ├── constants/project-roles.ts  CROSS_PROJECT_ROLES (ADMIN/MANAGEMENT/COORDINATOR — update ke-12)
│   └── user.view.ts              serializer user (passwordHash tidak pernah ikut)
├── users/  ·  projects/  ·  master-data/     controller + service + dto — projects/ sekarang juga
│                             endpoint membership (`GET/POST/DELETE /projects/:projectId/members`,
│                             Admin-only, update ke-12)
├── clashes/                      clash + komentar + audit log
│   ├── clashes.controller.ts     GET /clashes (filter/sort/pagination), GET /clashes/metrics
│   │                             (HARUS didaftarkan sebelum GET /:id — lihat komentar di file),
│   │                             GET /:id, POST, PATCH /:id, POST /bulk, POST /:id/comments,
│   │                             POST /:id/attachments, GET /:clashId/attachments/:id/download —
│   │                             semuanya sekarang menerima `@ActiveProject() projectId` (update ke-12)
│   ├── clashes.service.ts        RBAC per-field, generator uniqueCode, audit log server-side,
│   │                             list() (where/orderBy/skip/take Prisma), metrics() (port dari
│   │                             computeMetrics() frontend — keduanya harus tetap sinkron),
│   │                             applyPatch() memanggil NotificationsService setelah commit
│   │                             (assigned/status_change) — lihat §5 "Notifikasi async".
│   │                             `assertClashInProject()` (update ke-12) menggantikan semua akses
│   │                             `prisma.clash.findUnique` telanjang — lihat §5
│   └── clashes.service.spec.ts   test: RBAC, transisi status, closedAt, audit, uniqueCode,
│                                  list()/metrics(), attachment, +isolasi proyek (update ke-12)
├── testing/                      BARU (update ke-12): project-isolation.e2e-spec.ts — satu-satunya
│                             test di repo ini yang lewat HTTP sungguhan (supertest + Nest
│                             TestingModule, Prisma tetap di-mock), lihat §5
├── storage/                      StorageService — file lampiran ke disk lokal (S3/R2-ready),
│                                  lihat §5 "Lampiran: object storage lokal"
├── notifications/                BullMQ producer (NotificationsService) + consumer
│   │                             (NotificationsProcessor), EmailService (nodemailer + MailHog),
│   │                             WhatsAppService (WhatsAppProvider interface + mock),
│   │                             OverdueScannerService (cron harian 07:00),
│   │                             NotificationPreferenceController/Service (GET/PATCH /me,
│   │                             @SkipProjectScope() sejak update ke-12 — bukan data proyek) —
│   │                             lihat §5 "Notifikasi async"
└── prisma/                       PrismaService
```

**localStorage sekarang tidak dipakai sama sekali** — preferensi notifikasi (item terakhir yang masih client-only) pindah ke API di update ke-7. `clashhub-data-v5` tidak lagi dibaca/ditulis; kode hidrasinya sudah dihapus dari `data-context.tsx`, bukan sekadar dikosongkan. Key `clashhub-auth-user-id` **sudah tidak dipakai** — sesi sekarang bersandar pada cookie `httpOnly` `clashhub_refresh`.

---

## 4. Akun demo

Password untuk semua akun: **`demo1234`** — sekarang password asli, di-hash argon2id di database. Password salah ditolak 401.

| Peran | Email |
|---|---|
| Engineer | `engineer@clashhub.dev` |
| Coordinator | `coordinator@clashhub.dev` |
| Management | `management@clashhub.dev` |
| Admin | `admin@clashhub.dev` |

User tambahan: `rizky@clashhub.dev` (Engineer), `putri@clashhub.dev` (Coordinator).

Admin bisa membuat user baru dari `/admin/users`; user itu tersimpan di database dengan password default `demo1234` dan **langsung bisa login** (sudah diverifikasi end-to-end).

**Reset data demo (frontend):**
```js
localStorage.clear(); location.reload();   // hanya lampiran & preferensi notifikasi sekarang
```
Ini **tidak lagi menghapus clash** — clash ada di database. Untuk reset clash, hapus baris di tabel `Clash`/`Comment`/`AuditLog` lalu jalankan ulang `npx prisma db seed` (idempoten via `upsert` untuk master data; seeding clash **dilewati** kalau tabel `Clash` sudah tidak kosong — lihat `seedClashes()` di `apps/api/prisma/seed.ts`).

---

## 5. Arsitektur data — baca ini sebelum mengubah apa pun

### Fase hybrid sudah berakhir untuk domain inti

Sampai sebelum update ke-4, clash/komentar/audit log ada di `localStorage`. Sekarang semuanya dari API:

| Dari API (PostgreSQL) | Masih di `localStorage` |
|---|---|
| `project`, `users`, `disciplines`, `zones`, `statuses`, `priorities`, `clashes`, `comments`, `auditLogs` | `attachments`, `notificationPreferences` |

Sisa dua yang masih lokal masing-masing menunggu prasyaratnya sendiri: `attachments` menunggu object storage (schema `Attachment.fileUrl` sudah ada, belum ada yang mengisi — lihat §5 "Lampiran" di bawah), `notificationPreferences` menunggu modul notifikasi (Sprint 5/8, butuh Redis + BullMQ).

**Id master data BUKAN uuid — jangan pakai `@IsUUID()` untuk field yang mereferensikannya.** `apps/api/prisma/seed.ts` sengaja memakai id eksplisit (`proj-1`, `u-eng`, `disc-ars`, `st-open`, `pr-low`, `zone-1`, …) supaya seed idempoten dan gampang dibaca, bukan uuid acak. `Clash.disciplineId`/`zoneId`/`priorityId`/`statusId` dan `assigneeId` (user id) semuanya bisa berisi id seed non-uuid ini. `ClashesModule`'s DTO (`clash.dto.ts`) memakai `@IsString() @MinLength(1)` untuk field-field itu — **ini sempat bug** (awalnya pakai `@IsUUID()` dan menolak semua data seed dengan pesan "Disiplin/Zona/Prioritas tidak valid", ketahuan saat verifikasi browser). Kalau menambah DTO baru yang mereferensikan master data, jangan validasi sebagai uuid. Id `Clash`/`Comment`/`AuditLog`/`User`/`Project` baru (dibuat lewat API, bukan seed) tetap uuid asli dari `@default(uuid())` Prisma.

### Master data dibaca lewat useData(), bukan konstanta

- Untuk MEMBACA master data di komponen: pakai `useData()` (array live: `disciplines`, `zones`, `statuses`, `priorities`, `users`, `project`, `clashes`, `comments`, `auditLogs`) atau `useMasterDataLookups()` dari `use-master-data.ts`.
- `mock-data.ts` **sudah dihapus**. Kalau menemukan kode yang masih mengimpornya, itu sisa lama — hapus, jangan dikembalikan.

### Provider order penting (dan alurnya sekarang lebih halus)

`layout.tsx`: `DataProvider` membungkus `AuthProvider` (bukan sebaliknya) — **tetap seperti sebelumnya, jangan dibalik**.

Karena semua endpoint master data butuh token, urutan bootstrap-nya jadi:
1. `AuthProvider` mount → `restoreSession()` (POST `/api/auth/refresh` pakai cookie `httpOnly`).
2. Kalau ada sesi → panggil `reloadMasterData()` milik DataContext. Kalau tidak → `clearMasterData()`.
3. `DataContext.isLoading` baru `false` setelah salah satu dari keduanya dipanggil.

Jadi arah ketergantungannya: **auth memanggil data**, sesuai nesting provider-nya. Perilaku lama tetap dipertahankan:
1. User yang baru dibuat Admin bisa langsung login.
2. Kalau Admin menonaktifkan user yang sedang login, sesinya otomatis ter-logout (`user` di-derive dari `users.find(...).isActive`). Server juga menolak refresh untuk akun nonaktif, jadi penegakannya sekarang di dua sisi.

### Penulisan master data: optimistic + debounce 500ms

Halaman `/admin/master-data` memanggil `updateDiscipline(...)` dari `onChange` **setiap ketikan**. Kalau tiap keystroke jadi satu PATCH, itu badai request. Polanya sekarang: state lokal diperbarui seketika (optimistic), PATCH-nya di-coalesce dan ditunda 500ms (`PATCH_DEBOUNCE_MS`). Sudah diverifikasi: mengetik 19 karakter → **1** PATCH.

Kalau PATCH gagal, `data-context` menaruh pesannya di `syncError` dan menarik ulang data dari server (membatalkan perubahan optimistic). `AppShell` menampilkan `syncError` sebagai banner merah — jangan dihapus, itu satu-satunya cara kegagalan tulis terlihat user.

### Soft-delete, bukan hard-delete

`Discipline`, `Zone`, `Priority` punya field `isActive`. Admin "menghapus" via toggle nonaktif, bukan hapus permanen — supaya clash lama yang mereferensikan id itu tidak orphan. Konsekuensinya:
- Form input clash baru (`/clashes/new`) dan wizard import hanya menampilkan opsi **aktif**.
- Filter chip di Register menampilkan **semua** (termasuk nonaktif, diberi label "(nonaktif)") supaya item lama tetap bisa dicari.
- `Status` **tidak** punya `isActive` dan **tidak bisa** ditambah/dihapus dari Admin — cuma label & `isClosedState` yang bisa diubah. Alasan: `allowedStatusTransitions()` di `use-master-data.ts` bergantung pada `urutan` (4 tahap tetap) dan `isClosedState` (bukan lagi nama string — sudah diperbaiki supaya rename status "Closed" tidak merusak RBAC).

### ClashesModule: pola integrasi, mutator sekarang async

Clash, komentar, dan audit log mengikuti pola yang sama persis dengan Sprint 1 (tipe di `api/types.ts` → mapper di `api/mappers.ts` → context) tapi dengan satu perbedaan penting: **`createClash`, `updateClashField`, `bulkUpdateClashes`, dan `addComment` sekarang mengembalikan `Promise`**, bukan langsung memberi hasil sinkron. Semua call site sudah di-`await` (lihat `clashes/new/page.tsx`, `clashes/[id]/page.tsx`, `RegisterView.tsx`, `import/page.tsx`) — kalau menambah call site baru, jangan lupa `await`/`.catch()`, atau state UI (mis. tombol "Menerapkan…") tidak akan pernah sempat tampil.

**`GET /clashes` sekarang filter/sort/pagination server-side (update ke-5).** Query params: `q`, `disc`/`stat`/`prio`/`zone`/`assignee` (csv id), `reporterId`, `cf`/`ct` (tanggal, `YYYY-MM-DD`), `overdue` (`1`), `sort`, `dir`, `page`, `pageSize` (default 10, maks 10000). Respons `{ data, total }`. `RegisterView.tsx` mem-fetch endpoint ini langsung (debounced ~250ms per perubahan filter) alih-alih memfilter array lokal. Export (Excel/PDF) memanggil endpoint yang sama dengan `pageSize=10000` untuk mendapat seluruh hasil filter tanpa paginasi — makanya tombol export sekarang **async** dan bisa gagal (lihat `fetchAllMatching()` di `RegisterView.tsx`).

### Clashes tidak lagi di-bulk-load (update ke-5)

Sebelum update ke-5, `DataContext` memuat **seluruh** clash sekali di bootstrap (`master.clashes: Clash[]`) dan membaginya ke semua konsumen. Ini pola yang sama persis dengan masalah "muat semua" di atas, hanya dari sisi frontend: bahkan kalau `/clashes` sudah dipaginasi server-side, memuat semuanya ke context di awal sesi tetap mengirim seluruh tabel clash ke browser setiap login.

Sekarang `master.clashesById: Record<string, Clash>` — **cache kecil, bukan daftar lengkap**, terisi on-demand oleh `loadClashDetail()`, `createClash()`, dan `updateClashField()`. Konsekuensinya:

- **Register** (`RegisterView.tsx`), **Dashboard** (`DashboardView.tsx`), dan **Clash Saya** (`my-clashes/page.tsx`) masing-masing fetch sendiri dari `/clashes` (atau `/clashes/metrics` untuk Dashboard) — tidak ada satu pun yang membaca `clashesById`.
- **Halaman detail** (`clashes/[id]/page.tsx`) membaca `clashesById[id]`, diisi oleh `loadClashDetail(id)` yang sudah dipanggil di `useEffect` saat mount (tidak berubah dari sebelumnya).
- **`bulkUpdateClashes`** tidak lagi refetch & menyimpan ulang seluruh daftar clash ke context (dulu satu-satunya alasan fungsi ini melakukan refetch adalah supaya array global tetap segar). Sekarang ia hanya `POST /clashes/bulk` dan mengembalikan `{ updated }` — pemanggilnya (Register) yang bertanggung jawab refresh halamannya sendiri (lihat `reloadTick` di `RegisterView.tsx`).
- Kalau menambah halaman baru yang perlu menampilkan clash, **jangan** tergoda menambahkannya kembali ke `MasterState` sebagai array — fetch langsung dari `/clashes` dengan query params yang sesuai, seperti tiga contoh di atas.

**Komentar & audit log dimuat lazy per clash**, bukan ikut batch fetch awal. Halaman detail (`clashes/[id]/page.tsx`) memanggil `loadClashDetail(id)` di `useEffect` saat mount; hasilnya di-*merge* ke array `comments`/`auditLogs` di context (dedupe by id via `mergeById`). Kalau butuh komentar/audit di halaman lain, panggil `loadClashDetail` dulu — jangan asumsikan array itu sudah terisi.

**RBAC field-level ada di `ClashesService`, bukan cuma `@Roles()`.** Aturan "Engineer hanya boleh edit item sendiri (assignee atau reporter)" dan "Engineer hanya boleh maju status 1 langkah, tidak boleh ke status `isClosedState`" ditegakkan di server (`assertCanEdit`, `buildAllowedPatch`, `assertEngineerStatusTransition`) — sudah diverifikasi lewat `fetch()` langsung (bypass UI) mengembalikan 403. Kalau menambah field baru yang bisa diedit, field itu harus ditambahkan ke pengecekan role di sana, bukan cuma disembunyikan di form.

**Audit log & `uniqueCode` dibuat server-side.** `nilaiLama`/`nilaiBaru` diterjemahkan ke nama (status/prioritas/assignee), bukan id mentah — supaya riwayat tetap terbaca meskipun id-nya bukan uuid. `uniqueCode` dihitung dalam transaksi dengan retry sekali kalau kena `P2002` (dua user membuat clash di disiplin yang sama bersamaan).

### Lampiran: object storage lokal (update ke-6)

Lampiran sekarang benar-benar tersimpan di server, bukan lagi sesi-only. `NewClashInput.attachments[].file?: File` tidak berubah di form input, tapi `data-context.tsx`'s `createClash()` sekarang meng-upload file lewat `POST /clashes/:id/attachments` (multipart, `FilesInterceptor`) setelah clash-nya dibuat, alih-alih menulis metadata ke `localStorage`.

Backend: `apps/api/src/storage/storage.service.ts` (`StorageService`) menyimpan file ke disk di bawah `UPLOAD_DIR` (default `./uploads` relatif ke `apps/api`, key `${clashId}/${uuid}-${namaFileAsli}`) — satu-satunya tempat yang tahu path filesystem-nya; sisa kode (controller/service/frontend) hanya berurusan dengan `Attachment.id`. Didesain sebagai seam tunggal untuk pindah ke S3/R2 nanti (ganti isi file ini saja). Validasi tipe/ukuran/jumlah file (`image/*`/`application/pdf`, maks 10 MB, maks 10 file) ditegakkan ulang di server (`ClashesController.addAttachments`) — cek di frontend (`clashes/new/page.tsx`) cuma UX.

Unduh lewat `GET /clashes/:clashId/attachments/:attachmentId/download` (terbuka untuk semua user login, sama seperti `GET /clashes/:id`). Karena access token disimpan di memori (bukan cookie — lihat Gotcha #11), `<img src=...>`/`<a href=...>` biasa tidak bisa membawa header `Authorization`; jadi frontend selalu fetch lampiran lewat `apiDownloadBlob()` (`lib/api/client.ts`) lalu bikin `URL.createObjectURL()` dari `Blob`-nya. Ini dilakukan di `clashes/[id]/page.tsx` lewat `useEffect` yang jalan tiap kali attachment baru muncul — bukan lagi di `data-context.tsx` seperti sebelumnya — sehingga preview **selalu di-fetch ulang dari server**, bukan di-cache saat pembuatan. Konsekuensinya, batasan lama "pratinjau tidak tersedia setelah reload" **sudah tidak berlaku**.

### Notifikasi async: email (MailHog) + WhatsApp (mock) (update ke-7)

Sprint 5 (email) dan Sprint 8 (WhatsApp + preferensi) selesai sekaligus. Alurnya: `ClashesService.applyPatch()` — satu-satunya jalur tulis untuk `update()` dan `bulkUpdate()`, sudah menghitung label lama/baru per field yang berubah — memanggil `NotificationsService` **setelah** transaksi commit:
- `assigneeId` berubah ke non-null → `enqueueAssigned(clashId, assigneeId)`.
- `statusId` berubah → `enqueueStatusChange(clashId, recipients, oldLabel, newLabel)`, `recipients` = gabungan `{assigneeId, reporterId}` (setelah patch, minus null, minus actor sendiri). **Ini asumsi produk**, bukan dari sprint plan literal (yang cuma bilang "notifikasi terpicu saat status berubah" tanpa merinci penerima) — kalau ternyata harus assignee-only, ubah di `ClashesService.publishNotifications()`.

Enqueue ini **fire-and-forget** (`.catch()` + `Logger.warn`, tidak di-`await` sebagai bagian dari response): kegagalan queue (mis. Redis mati) tidak boleh menggagalkan update clash itu sendiri.

Worker (`NotificationsProcessor`, `@Processor('notifications')`) memuat `NotificationPreference` user (default `{ emailEnabled: true, whatsappEnabled: false }` kalau belum ada baris — sama seperti default di `settings/notifications/page.tsx`), kirim ke kanal aktif, dan **selalu fallback ke email kalau WhatsApp gagal** — terlepas dari toggle email user (spesifik dari Sprint 8). Satu baris `Notification` ditulis per kanal yang benar-benar dicoba (`isSent` true/false).

**Email:** `EmailService` pakai `nodemailer` ke MailHog (`SMTP_HOST`/`SMTP_PORT` di `.env`, tanpa auth) — bukan SMTP produksi. Lihat email yang "terkirim" di `http://localhost:8025`. Ganti ke SMTP asli tinggal isi `auth` di `email.service.ts` dan ubah env.

**WhatsApp:** `WhatsAppService` adalah interface (`WhatsAppProvider`) + `MockWhatsAppProvider` yang cuma log dan menganggap selalu berhasil — **bukan integrasi WhatsApp Business API asli**. Pola sama seperti `StorageService`: satu binding di `NotificationsModule` (`{ provide: WHATSAPP_PROVIDER, useClass: MockWhatsAppProvider }`) yang diganti kalau mau pasang provider asli (mis. Meta Cloud API), tanpa menyentuh `NotificationsProcessor`.

**Overdue scanner:** `OverdueScannerService` jalan cron harian jam 07:00 (`@Cron('0 7 * * *')`), cari clash `dueDate < now` + belum closed + ada assignee, skip pasangan clash+assignee yang sudah dapat notifikasi `OVERDUE` hari itu (dedup by `Notification.createdAt >= startOfToday`).

**Preferensi notifikasi pindah dari `localStorage` ke API** — `GET`/`PATCH /notification-preferences/me`, upsert per user dari JWT (bukan body — tidak bisa ubah preferensi orang lain). Validasi E.164 untuk `whatsappNumber` ada di server (`NotificationPreferenceService`) juga, bukan cuma di form frontend. `data-context.tsx` fetch ini sekaligus di `reloadMasterData()`; `settings/notifications/page.tsx` sekarang manggil `updateNotificationPreference()` (async) alih-alih `setNotificationPreference()` (sync, localStorage).

### Impor massal: CSV/XML async + dedup (update ke-9)

Sprint 9 backend selesai. Sebelumnya `/import` mem-parse file **di browser** (`src/lib/csv.ts`) lalu menembak `POST /clashes` satu request per baris — tidak ada job async, tidak ada idempotensi, XML di-scope-cut. Sekarang seluruhnya pindah ke `apps/api/src/import/` (`ImportModule`):

- `POST /import/preview` (multipart, maks 10 MB) mem-parse file (CSV via parser ported dari `src/lib/csv.ts` lama; XML lewat `fast-xml-parser`, mendukung bentuk atribut Navisworks `<clashresult>` dan Solibri `<issue>` — lihat `src/import/parsers/`), menyimpannya lewat `StorageService` di bawah prefix `imports/`, dan mengembalikan `{ token, columns, sampleRows, totalRows, suggestedMapping }`. `token` = storage key, dipakai `commit` supaya file tidak perlu di-upload ulang.
- `POST /import/commit` `{ token, fileName, mapping, autoCreateMasterData? }` membuat baris `ImportJob` (status `QUEUED`) dan `queue.add()` ke antrean BullMQ `import`, **tidak menunggu prosesnya** — langsung balas `{ jobId }`. `autoCreateMasterData: true` ditolak 403 untuk non-Admin.
- `GET /import/jobs/:id` — status/progres/laporan error, di-poll frontend tiap 1 detik. Di-scope ke pembuat job atau Admin.
- `ImportProcessor` (`@Processor('import')`) memproses tiap baris dalam **transaksi terpisah** lewat `ClashesService.createClashRecord()` — method baru yang diekstrak dari `ClashesService.create()` supaya generate-`uniqueCode`-plus-retry-`P2002` tidak disalin-tempel. Baris sukses ditulis dengan `AuditLog.action = "imported"` (bukan `"created"`) — **frontend `auditText()` di `clashes/[id]/page.tsx` sudah di-update untuk case ini**; kalau lupa menambah case baru untuk action baru di masa depan, hasilnya string `"undefined"`/`"undefined"` yang lolos type-check tapi salah di runtime (ditemukan & diperbaiki di sesi ini, lihat §9).
- **Dedup**: kalau mapping menyertakan kolom `externalId`, `(projectId, externalId)` yang sudah ada di-skip (`skippedRows`, bukan `failedRows`). Constraint unique di DB adalah penjaga akhir untuk race antar job — kalau kena, `createClashRecord()` melempar `DuplicateExternalIdError` alih-alih retry `uniqueCode`, dan `ImportProcessor` menangkapnya sebagai skip juga.
- **Auto-create master data** (Admin-only): disiplin/zona/prioritas dari file yang tidak dikenal dibuat otomatis alih-alih membuat barisnya gagal.
- Migrasi baru: `Clash.externalId` (nullable, `@@unique([projectId, externalId])`) + model `ImportJob` (progres/laporan per job).

**Template master data antar proyek** (sisa deliverable Sprint 9): `POST /master-data/templates/copy` `{ fromProjectId, toProjectId, include }` (Admin), menyalin disiplin/zona **aktif** yang belum ada di tujuan — idempoten. Saat ditulis (update ke-9), ClashHub masih single-project secara runtime meski schema-nya sudah multi-project (lihat update ke-12 di bawah — ini sudah tidak berlaku lagi), jadi saat itu cuma ditambah `GET /projects` (Admin) minimal supaya dialog "Salin dari proyek lain" di `/admin/master-data` punya sesuatu untuk dipilih. Endpoint ini sengaja **tetap** cross-project by design (body eksplisit `fromProjectId`/`toProjectId`, ditandai `@SkipProjectScope()` sejak update ke-12) — beda dari endpoint clash/master-data lain yang sekarang wajib scoped ke satu proyek aktif.

Frontend: `src/app/import/page.tsx` ditulis ulang total — upload lewat `apiUpload()`, terima kolom & saran mapping dari server (bukan menghitungnya sendiri), commit lalu poll job dengan `setTimeout` chain (bukan `setInterval`, supaya tidak ada request tumpang tindih) yang di-`clearTimeout` saat unmount. `src/lib/csv.ts` dan `csv.test.ts` **dihapus** — satu-satunya konsumen (`import/page.tsx`) sudah tidak memakainya lagi.

### Koreksi ProjectMemberGuard + hardening Sprint 11 (update ke-11)

**`ProjectMemberGuard` (`common/guards/project-member.guard.ts`) ternyata tidak pernah dipasang di rute mana pun.** Klaim di update ke-2/3 dan §3/§7 sebelumnya ("RolesGuard + @Roles() + ProjectMemberGuard dipakai oleh route clash") sudah basi — `grep` di seluruh `apps/api/src` cuma menemukan definisi kelasnya, nol pemakaian `@UseGuards(ProjectMemberGuard)`. Ditemukan saat audit RBAC Sprint 11. Konsekuensi konkret yang diperbaiki: `GET /clashes/:clashId/attachments/:attachmentId/download` cuma dijaga guard global (login saja, peran apa pun) — `getAttachmentForDownload` cuma mencocokkan `attachment.clashId === clashId`, tidak ada cek keanggotaan proyek sama sekali. Karena `ProjectMemberGuard` men-skip diri sendiri kalau tidak ada `:projectId` di route params (dan rute clash cuma punya `:id`/`:clashId`/`:attachmentId`), memasang guard itu di rute ini tidak akan memperbaiki apa-apa — perbaikannya jadi pengecekan langsung di `ClashesService.assertProjectMember()` (dipanggil dari `getAttachmentForDownload`, Admin bypass, method sama seperti pola guard yang sudah ada). **Dampak nyata di produksi rendah** — `UsersService.create()` (`src/users/users.service.ts:29-36`) sudah membuat baris `ProjectMember` untuk setiap user baru (Admin panel maupun seed), jadi semua user aktif hari ini memang anggota proyek; gap ini cuma kena kalau `ProjectMember`-nya dihapus manual atau di masa depan ClashHub jadi benar-benar multi-project.

**Audit RBAC controller lain** (users, projects, master-data, import, notification-preferences): dibaca ulang semua kombinasi `@Roles()`/`@Public()`, konsisten dengan tabel RBAC §6 — tidak ditemukan gap tambahan di luar yang di atas.

> **Update ke-12 menggantikan seluruh subbab ini.** `ProjectMemberGuard` yang dibahas di atas **sudah dihapus total** (bukan lagi "didefinisikan tapi tidak dipasang") dan digantikan `ProjectContextGuard` yang benar-benar dipasang global. Subbab ini dipertahankan sebagai riwayat (kenapa keputusan sebelumnya masuk akal saat itu), bukan deskripsi kondisi saat ini — baca subbab berikutnya untuk kondisi sekarang.

### Otorisasi multi-project (update ke-12)

Permintaan ad-hoc (di luar `ClashHub_Sprint_Plan.md`, tidak ada sprint number): ubah dari single-project runtime jadi multi-project sungguhan dengan otorisasi per-proyek, memakai schema `Project`/`ProjectMember` yang sebenarnya sudah ada sejak Sprint 0 tapi tidak pernah benar-benar ditegakkan (lihat subbab di atas).

**Desain guard.** `ProjectContextGuard` (`common/guards/project-context.guard.ts`) didaftarkan sebagai `APP_GUARD` di `app.module.ts`, urutan **Throttler → JwtAuthGuard → RolesGuard → ProjectContextGuard** (guard butuh `request.user` dari JwtAuthGuard dan role dari situ juga sebelum bisa memutuskan apakah membership perlu dicek). Perilakunya:
- Route ditandai `@SkipProjectScope()` → lolos tanpa cek apa pun.
- Tidak ada `request.user` (route `@Public()`) → lolos (tidak ada yang perlu di-scope).
- Selain itu: **wajib** ada header `X-Project-Id`, kalau tidak → 403. Proyek harus benar-benar ada di DB → kalau tidak → 404. Kalau role user **bukan** salah satu `CROSS_PROJECT_ROLES` (`ADMIN`/`MANAGEMENT`/`COORDINATOR`, di `common/constants/project-roles.ts`) → wajib ada baris `ProjectMember(projectId, userId)` → kalau tidak → 403.
- Lolos semua → `request.activeProjectId = projectId`, dibaca controller lewat decorator `@ActiveProject()` (mirip `@CurrentUser()`).

Ini **deny-by-default** — beda filosofi dari `ProjectMemberGuard` lama yang `return true` kalau tidak ada `:projectId` di request. Konsekuensinya: **setiap controller baru yang tidak butuh scope proyek WAJIB ditandai eksplisit** `@SkipProjectScope()`, kalau lupa route itu akan menolak semua request dengan 403 "Header X-Project-Id wajib disertakan." — ini persis bug yang ditemukan lewat verifikasi browser di sesi ini sendiri (lihat §8).

**Kenapa Coordinator/Management ikut bypass, bukan cuma Admin.** Keputusan eksplisit dari user selama sesi ini (bukan asumsi) — hanya Engineer yang benar-benar dibatasi ke proyek assignment-nya; Coordinator/Management/Admin dianggap peran yang mengawasi lintas-proyek. Kalau ini berubah nanti, satu tempat yang perlu diubah adalah array `CROSS_PROJECT_ROLES`.

**Resource-level check, bukan cuma header.** Header yang valid hanya membuktikan "user boleh memakai proyek ini", bukan "resource yang diminta memang ada di proyek ini". `ClashesService.assertClashInProject(clashId, projectId)` (menggantikan pola lama yang langsung `prisma.clash.findUnique({ where: { id } })` tanpa cek apa pun) dipakai di `findDetail`, `update`, `addComment`, `addAttachments`, `getAttachmentForDownload` — clash yang ada tapi bukan di proyek aktif dilaporkan **404**, bukan 403, supaya caller tidak bisa membedakan "tidak ada" dari "ada tapi bukan punyamu". `bulkUpdate` memvalidasi **seluruh** batch sekaligus (`clash.findMany({ where: { id: { in: ids }, projectId } })`, cocokkan jumlahnya dengan `ids.length`) — kalau satu saja id dari proyek lain, seluruh batch ditolak 404, tidak diam-diam di-skip (skip diam-diam akan membuat respons 200 parsial bisa dipakai memprobe id asing).

**Empat helper `currentProject()`/`currentProjectId()` yang lama (masing-masing query "proyek tertua" sendiri-sendiri di `clashes.service.ts`, `master-data.service.ts`, `import.service.ts`, dan inline di `projects.service.ts`/`users.service.ts`) semuanya dihapus.** Semua method service yang tadinya memanggilnya sekarang menerima `projectId` sebagai parameter dari controller (`@ActiveProject()`). `import.processor.ts` (worker BullMQ) **tidak diubah** — dari awal sudah resolve project lewat `importJob.projectId` sendiri, bukan lewat helper "proyek tertua", jadi sudah aman multi-project by construction.

**`GET /projects` sekarang terbuka untuk semua role** (sebelumnya Admin-only) — hasilnya difilter: `CROSS_PROJECT_ROLES` dapat semua proyek, Engineer cuma dapat proyek yang dia jadi `ProjectMember`-nya. `GET /projects/current` dipertahankan (bukan dihapus) sebagai fallback "proyek pertama" untuk pre-select awal sebelum user memilih lewat switcher — semantiknya berubah dari "proyek tertua global" jadi "proyek tertua milik user ini" (atau proyek tertua overall untuk `CROSS_PROJECT_ROLES`). Endpoint baru Admin-only: `GET/POST/DELETE /projects/:projectId/members` (`ProjectsService.listMembers/addMember/removeMember`) — `UsersService.create()` **berhenti** auto-join user baru ke satu proyek (dulu ini justru yang membuat gap `ProjectMemberGuard` lama nyaris tidak kerasa — lihat subbab di atas); assign membership sekarang harus eksplisit lewat endpoint ini.

**Frontend.** `lib/api/client.ts` kirim header `X-Project-Id` otomatis di setiap request (`setActiveProjectId()`, pola identik `setAccessToken()`) — tidak perlu mengubah tiap call site satu-satu. `data-context.tsx`: `reloadMasterData()` sekarang fetch `GET /projects` (bukan `/projects/current`) untuk dapat daftar proyek milik user, pilih `activeProjectId` (dari `localStorage` kalau masih valid, kalau tidak proyek pertama), baru fetch disiplin/zona (yang butuh proyek aktif) — urutannya penting, header harus di-set sebelum fetch yang di-scope proyek jalan. `setActiveProject(id)` baru: ganti proyek aktif, refetch disiplin/zona, **kosongkan** `clashesById`/`comments`/`auditLogs`/`attachments` (cache lama sudah tidak valid untuk proyek baru). `AppShell.tsx` & `DashboardView.tsx` dapat dropdown switcher sungguhan (yang di `DashboardView` sebelumnya selalu `disabled`). `/admin/projects` dapat UI kelola anggota (list + tambah + hapus) memakai `lib/api/projects.ts` baru.

**Seed** (`prisma/seed.ts`): `PROJECT` lama (`proj-1`/MCA, semua 10 user jadi anggota) **tidak diubah** — hanya *ditambah* `PROJECT_2` (`proj-2`/GSB, 3 disiplin, 2 zona, 12 clash dengan rng seed berbeda) dengan `PROJECT_2_MEMBER_IDS = ['u-eng2', 'u-coord', 'u-admin']` sengaja **tidak** semua user, supaya ada Engineer (`u-eng`/Yanuar) yang murni anggota `proj-1` untuk uji isolasi. `seedProject2Clashes()` cek eksistensi di-scope `projectId` (bukan `prisma.clash.count()` global seperti `seedClashes()` lama) supaya tetap jalan walau `proj-1` sudah ada clash-nya.

**Testing.** Tidak ada infrastruktur e2e/HTTP sebelumnya di `apps/api` — semua `*.spec.ts` lama instantiate service langsung dengan Prisma di-mock, tanpa lewat routing HTTP sungguhan. Untuk membuktikan IDOR (ganti id di URL, ganti header, kirim id proyek lain di body/query) secara jujur, ditambah harness baru: `apps/api/src/testing/project-isolation.e2e-spec.ts` — Nest `TestingModule` (hanya `ClashesModule`+`MasterDataModule`+`ProjectsModule`, BUKAN `AppModule` penuh supaya tidak butuh koneksi Redis/BullMQ nyata) + `supertest` (devDependency baru, bareng `@types/supertest`) terhadap `app.getHttpServer()`, Prisma tetap di-mock in-memory (2 proyek, masing-masing clash/disiplin/zona/member sendiri), `JwtAuthGuard` diganti `TestAuthGuard` lokal (baca `x-test-user-id`/`x-test-user-role` dari header, tidak perlu JWT sungguhan) sementara `RolesGuard`+`ProjectContextGuard` **asli** tetap dipakai — yang diuji jadi logika otorisasi sesungguhnya, bukan mock. 10 skenario: header hilang, header proyek asing (non-member ditolak), id URL disilang (404), PATCH/comment ke id proyek lain (404), bulk update yang menyelundupkan id asing (404, tidak ada mutasi), list/master-data terisolasi per proyek, projectId asing di query string diabaikan (DTO whitelist), `CROSS_PROJECT_ROLES` tetap tembus tanpa `ProjectMember`, proyek yang tidak ada di-404. Plus `project-context.guard.spec.ts` (unit test guard, pola sama seperti `roles.guard.spec.ts` yang sudah ada).

**Diverifikasi live di browser** (bukan cuma test otomatis) — lihat §9 gotcha baru soal bug yang ketemu justru dari langkah ini: login Admin → switch proyek MCA↔GSB di sidebar → Register/disiplin/zona berganti sesuai (91 vs 12 clash); tambah/hapus anggota proyek di `/admin/projects` → daftar berubah sungguhan lewat API; login Engineer (`u-eng`, cuma anggota MCA) → navigasi langsung ke URL clash milik GSB → **"Clash tidak ditemukan"** (404 dari network tab, bukan cuma UI yang menyembunyikan), project switcher otomatis hilang (karena `projects.length <= 1` untuknya).

---

## 6. RBAC yang ditegakkan

| Peran | Register | Bulk update | Export | Buat clash | Edit item | Komentar | Dashboard | Admin | Import CSV |
|---|---|---|---|---|---|---|---|---|---|
| **Engineer** | ✅ | ❌ | ✅ | ✅ | Item sendiri, status maju 1 langkah saja | ✅ | ❌ | ❌ | ❌ |
| **Coordinator** | ✅ | ✅ | ✅ | ✅ | Penuh¹ | ✅ | ✅ | ❌ | ✅ |
| **Management** | ✅ baca-saja | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | Penuh¹ | ✅ | ✅ | ✅ | ✅ |

¹ **Assignee hanya boleh Engineer aktif** (permintaan ad-hoc pasca update ke-12, di luar Sprint Plan asli — bukan lagi "Engineer atau Coordinator"). "Penuh" berarti Coordinator/Admin boleh mengubah `assigneeId` ke user manapun *yang lolos aturan itu*, atau `null` untuk melepas — bukan benar-benar bebas. Ditegakkan `ClashesService.assertAssigneeIsEngineer()`, dipanggil dari dua jalur terpisah: `buildAllowedPatch()` (`PATCH /clashes/:id`) dan `bulkUpdate()` (`POST /clashes/bulk`, yang **tidak** melalui `buildAllowedPatch()` — sebelum perubahan ini, bulk-assign sama sekali tidak divalidasi). Data lama diperbaiki lewat migrasi `20260806120000_null_non_engineer_assignees` (assignee non-Engineer di-null-kan, tanpa baris `AuditLog` — lihat §12 untuk alasannya). Terverifikasi: dropdown assignee di UI (detail & bulk) cuma menampilkan Engineer aktif, **dan** `fetch()` langsung ke `PATCH /clashes/:id`/`POST /clashes/bulk` dengan `assigneeId` Coordinator dari console browser (melewati UI) → `400 Bad Request`, bukan tersembunyi doang di client.

Aturan terpusat di frontend: `src/lib/lookup.ts` (`canEditClash`, `canComment`, `isAssignable`) + `src/lib/use-master-data.ts` (`allowedStatusTransitions`) + guard `use-require-auth.ts`/`use-require-admin.ts`.

**Sejak Sprint 1, RBAC juga ditegakkan di server** — guard frontend kini sekadar UX, bukan satu-satunya pertahanan. `RolesGuard` di NestJS menolak dengan 403, dan `JwtAuthGuard` global menolak request tanpa token dengan 401. **Sejak `ClashesModule`, ini juga berlaku untuk kolom "Edit item"** — bukan cuma peran, tapi juga "item sendiri", "status maju 1 langkah", dan sekarang "assignee harus Engineer aktif" ditegakkan di `ClashesService`, sudah diverifikasi lewat `fetch()` langsung yang melewati UI. Tabel endpoint lengkap ada di `apps/api/README.md`.

**Sejak update ke-12, ada dimensi otorisasi kedua yang independen dari tabel di atas: proyek.** Tabel ini menjawab "boleh apa", bukan "di proyek mana" — keduanya digabung, bukan salah satu menggantikan yang lain. Engineer tetap cuma bisa edit item sendiri, **dan** hanya untuk clash yang ada di proyek yang dia jadi anggotanya (`ProjectMember`). Coordinator/Management/Admin tetap terikat tabel di atas untuk "boleh apa", tapi khusus dimensi proyek mereka **lintas-proyek** (`CROSS_PROJECT_ROLES`, lihat §5 "Otorisasi multi-project"). Ditegakkan oleh `ProjectContextGuard` + `assertClashInProject`, bukan bagian dari tabel/kode RBAC yang dijelaskan di paragraf ini.

---

## 7. Status per sprint (Sprint Plan asli)

| Sprint | Fokus | Status | Catatan |
|---|---|---|---|
| 0 | Fondasi backend | ✅ Selesai | NestJS + Prisma + PostgreSQL, 4 migrasi ter-apply, seed idempoten, `/api/health`. CI (`.github/workflows/ci.yml`) + Dockerfile produksi (web & api) ditambahkan update ke-10 — lihat §12 untuk detail & yang masih tersisa |
| 1 | Auth, RBAC, Administrasi | ✅ Selesai | JWT + argon2id, RolesGuard (ProjectMemberGuard awalnya didefinisikan tapi tidak dipasang, sekarang diganti `ProjectContextGuard` yang benar-benar aktif — lihat §5 "Otorisasi multi-project", update ke-12), CRUD user/proyek/master-data, **frontend tersambung**, 12 unit test lulus |
| 2 | Input clash + lampiran | ✅ Selesai | Clash dari DB via `ClashesModule`; lampiran tersimpan di disk lewat `StorageService` (update ke-6, lihat §5 "Lampiran") |
| 3 | Clash Register | ✅ Selesai | Data clash dari DB, filter/sort/pagination server-side (`GET /clashes`, update ke-5) |
| 4 | Detail, komentar, audit, triase | ✅ Selesai | Komentar & audit dari DB (lazy-load per clash), RBAC field-level di server, audit trail server-generated; tab Riwayat sekarang refresh otomatis setelah edit (`updateClashField` memanggil `loadClashDetail` — diperbaiki di commit `548db09`) |
| 5 | Notifikasi email async | ✅ Selesai, terverifikasi live | BullMQ + Redis, `NotificationsProcessor` kirim email via MailHog (update ke-7, lihat §5 "Notifikasi async"); diverifikasi end-to-end di update ke-8 |
| 6 | Dashboard Manajemen | ✅ Selesai | Agregasi (KPI/tren/sebaran) dihitung server-side (`GET /clashes/metrics`, update ke-5) |
| 7 | Export Excel/PDF + Bulk update | ✅ Selesai | Export client-side (SheetJS + jsPDF); bulk update sekarang lewat `POST /clashes/bulk` |
| 8 | WhatsApp + preferensi kanal | ✅ Selesai, terverifikasi live | `WhatsAppService` mock (bukan Business API asli — lihat §5), preferensi pindah dari localStorage ke `GET`/`PATCH /notification-preferences/me` (update ke-7); diverifikasi end-to-end di update ke-8 |
| 9 | Bulk import CSV/XML | ✅ Selesai (update ke-9) | `ImportModule` async via BullMQ (`/import/preview`+`/commit`+`/jobs/:id`), CSV & XML (Navisworks/Solibri), dedup by `externalId`, auto-create master data (Admin), `POST /master-data/templates/copy`; lihat §5 "Impor massal" |
| 10 | Fitur AI (opsional) | ❌ Belum | Butuh eval harness + AI asli |
| 11 | Hardening, performa, deploy | 🟡 Sebagian besar selesai (update ke-11) | Keamanan (helmet, rate limit, exception filter, validasi env, refresh token versioning, RBAC lampiran), observability (pino, Sentry opsional, `/health/ready`), dan uji beban 10.000 clash (semua target NFR lolos, terukur nyata) selesai. **Belum**: deploy ke host nyata (cuma artefak/dokumentasi, lihat §13), Prometheus, uptime 99,5% (butuh monitoring produksi riil). Lihat §12 untuk rincian lengkap. |
| — | **Otorisasi multi-project** (ad-hoc, bukan sprint asli) | ✅ Selesai (update ke-12) | `ProjectContextGuard` + `@SkipProjectScope()`/`@ActiveProject()`, isolasi per-proyek server-side untuk clash/master-data/import, `assertClashInProject` (404 bukan 403), `CROSS_PROJECT_ROLES`, project switcher + kelola anggota di frontend, harness IDOR baru via `supertest`, diverifikasi live browser. Lihat §5 "Otorisasi multi-project". |

**Langkah berikutnya yang paling masuk akal:** lihat §12.

---

## 8. Bug & jebakan yang ditemukan (lintas sesi)

Dicatat supaya tidak terulang kalau menyentuh file yang sama.

**Sesi otorisasi multi-project (update ke-12):**

x. **`NotificationPreferenceController` kelewat saat memasang `ProjectContextGuard` global.** Guard baru itu deny-by-default — setiap controller yang bukan data proyek harus ditandai eksplisit `@SkipProjectScope()`. Semua controller lain (users, projects, master-data non-disiplin/zona, import) sudah ditandai lewat audit manual per-file, tapi `NotificationPreferenceController` (`/notification-preferences/me`) kelupaan karena letaknya di modul `notifications/`, bukan salah satu yang "kelihatan jelas" butuh scoping proyek. **Baru ketahuan lewat verifikasi browser** (bukan lewat test — tidak ada test yang menyentuh route ini sama sekali): login sukses tapi `GET /notification-preferences/me` balas 403 begitu `reloadMasterData()` jalan, padahal seharusnya selalu bisa diakses siapa pun yang login (preferensi per-user, bukan per-proyek). Diperbaiki: tambah `@SkipProjectScope()`. **Pelajaran untuk sesi berikutnya**: kalau menambah guard global baru yang butuh opt-in/opt-out per route, jangan cuma menandai controller yang "kelihatan" butuh — `grep -rn "@Controller(" apps/api/src` dulu untuk daftar lengkap, lalu putuskan tiap satu secara eksplisit (lihat daftar lengkap 8 controller di §3).
y. **`ForbiddenException`/`NotFoundException` yang tepat, bukan asal pilih satu.** Godaan awal adalah membuat semua penolakan proyek jadi 403 (lebih gampang seragam), tapi itu bocor informasi: 403 di level resource (`assertClashInProject`) berarti "clash ini ADA tapi bukan proyekmu" — atacker bisa memakai perbedaan 403 vs 404 untuk memetakan id yang valid di proyek lain. Aturan yang dipakai: guard level (header salah/hilang/non-member) → 403 (memang benar-benar "kamu tidak boleh pakai proyek ini"), resource level (clash/disiplin/zona yang ada tapi di proyek lain) → 404 (supaya tidak beda dari "tidak ada sama sekali"). Kalau menambah resource-scoped check baru, ikuti pembagian ini, jangan asal konsisten-1-kode-status.

**Sesi `ClashesModule` (update ke-4):**

a. **DTO clash memvalidasi id master data sebagai uuid, padahal bukan.** `CreateClashDto`/`UpdateClashDto`/`BulkUpdatePatchDto` awalnya pakai `@IsUUID()` untuk `disciplineId`/`zoneId`/`priorityId`/`statusId`/`assigneeId`. Semua id seed (`disc-ars`, `zone-1`, dst.) bukan uuid, jadi setiap request ditolak 400 dengan pesan "Disiplin/Zona/Prioritas tidak valid" — ketahuan langsung saat verifikasi browser (submit form clash baru). Diperbaiki: ganti jadi `@IsString() @MinLength(1)`. Lihat §5 "Id master data BUKAN uuid".
b. **`BulkToolbar` sudah `await onApply()` dengan benar, tapi `RegisterView.tsx` memberinya callback yang tidak mengembalikan Promise.** `onApply={(patch) => { bulkUpdateClashes(...); setSelectedIds(...); }}` — closure ini `undefined`, bukan `Promise`, jadi `await` di `BulkToolbar` langsung lanjut walau `bulkUpdateClashes` (network call) belum selesai. Efeknya: state `applying`/"Menerapkan…" tidak pernah sempat tampil, dan tidak ada jalur galat kalau request gagal. Diperbaiki: `onApply` di `RegisterView.tsx` sekarang `async` dan meng-`await` `bulkUpdateClashes` sebelum mengosongkan seleksi.
c. **Prisma `ClashUpdateInput` (checked) tidak mengekspos field FK skalar** ketika field itu punya relasi di schema — hanya bentuk relasi (`connect`/`disconnect`) yang tersedia. Karena `ClashesService.applyPatch` sudah memvalidasi keberadaan `statusId`/`priorityId`/`assigneeId` sebelum menulis, dipakai `Prisma.ClashUncheckedUpdateInput` supaya bisa set field skalar langsung tanpa ceremony `connect`.

**Sesi Sprint 1 (integrasi backend):**

0a. **PATCH per keystroke.** `/admin/master-data` memanggil `updateDiscipline` dari `onChange`, jadi menyambungkannya langsung ke API berarti satu request per huruf. Diperbaiki dengan optimistic update + debounce 500ms di `data-context.tsx` (lihat §5).
0b. **Daftar akun demo di `/login` jadi kosong.** Kartu itu dulu membaca `users` dari `useData()`; setelah user datang dari API, sebelum login daftarnya kosong. Diperbaiki: `DEMO_ACCOUNTS` ditulis statis di `login/page.tsx`.
0c. **Seed lama ber-UUID membuat proyek salah.** `projects/current` memakai `findFirst({ orderBy: createdAt asc })`, sehingga selama baris seed Sprint 0 (uuid, `PMW-01`) masih ada, sidebar menampilkan proyek yang salah dan chip filter jadi ganda. Baris-baris basi itu sudah dihapus; seed sekarang idempoten dan ber-id tetap.
0d. **`expiresIn` dari `ConfigService` tidak lolos tipe.** `@nestjs/jwt` mengetatkan `expiresIn` ke `number | StringValue`, sedangkan `config.get<string>()` mengembalikan `string`. Ditangani lewat helper `ttl()` di `auth.service.ts` — jangan diganti jadi `any`.

**Sesi frontend sebelumnya:**

1. **`RegisterView.tsx`** — filter memicu `router.replace()` Next.js di setiap klik → request RSC ke server tiap interaksi, terasa lemot. Diperbaiki: filter state murni di client + `window.history.replaceState` yang di-debounce 350ms.
2. **`FilterChips.tsx` / `RegisterView.tsx`** — re-render seluruh 24 chip filter tiap 1 klik karena handler & array opsi dibuat baru tiap render. Diperbaiki: `memo()` + opsi di-`useMemo`, handler di-`useCallback`.
3. **`DashboardView.tsx`** — semua bar chart Recharts tidak tergambar sama sekali (grup `<g>` kosong) karena animasi masuk bergantung `requestAnimationFrame`. Diperbaiki: `isAnimationActive={false}` di semua `<Bar>`/`<Line>`.
4. **`settings/notifications/page.tsx`** — toggle WhatsApp ON memvalidasi nomor tapi tidak ikut menyimpannya (hanya `whatsappEnabled` yang di-patch) → bisa aktif dengan nomor kosong kalau user tidak sempat blur field nomor dulu. Diperbaiki: nomor ikut disertakan dalam patch yang sama saat toggle ON.
5. **`dashboard-metrics.ts` / `RegisterView.tsx`** — array prioritas dari context tidak dijamin terurut bobot (Low→Critical), padahal ramp warna ordinal di dashboard dan urutan chip filter mengasumsikan urutan itu. Diperbaiki: `.sort((a,b) => a.bobot - b.bobot)` sebelum dipakai di kedua tempat.

---

## 9. Gotcha penting (baca sebelum menulis kode)

1. **`AGENTS.md` mewajibkan** membaca `node_modules/next/dist/docs/` sebelum menulis kode. Next.js 16 punya breaking change dari versi yang mungkin ada di data latihmu (contoh: `params`/`searchParams` di halaman adalah `Promise`, dipakai dengan `use()` bahkan di Client Component — lihat `src/app/clashes/[id]/page.tsx`).
2. **Jangan pakai `router.replace()` untuk update URL di jalur interaksi cepat** (filter, search, chip toggle). Pola yang dipakai: state di React + `window.history.replaceState` yang di-debounce. Lihat §8.1.
3. **Recharts wajib `isAnimationActive={false}`** di lingkungan ini. Lihat §8.3.
4. **ESLint `react-hooks/set-state-in-effect`** akan error pada hidrasi dari `localStorage` — beri `eslint-disable-next-line` dengan alasan (pola sudah ada di `data-context.tsx`, `auth-context.tsx`, `RegisterView.tsx`, `DashboardView.tsx`; jangan dihapus).
5. **`tsconfig.json` & `eslint.config.mjs` mengecualikan `apps/**`** — itu backend NestJS terpisah, bukan bagian dari proyek Next.js ini. Jangan hapus exclude ini kecuali memang berniat menyatukan monorepo.
6. **Warning lint yang aman & sudah diketahui:** `react-hooks/incompatible-library` pada `useReactTable` di `RegisterView.tsx` — TanStack Table memang stack wajib PRD.
7. **Next 16 hanya izinkan satu instance `next dev`** per proyek (lockfile). Jangan jalankan dua dev server. Hal serupa berlaku untuk backend: proses `nest start --watch` yang menumpuk akan **mengunci `node_modules/.prisma/client/query_engine-windows.dll.node`** sehingga `npx prisma generate` gagal dengan `EPERM`. Kalau kena itu, matikan dulu semua proses node yang menunjuk ke `D:\WebApp`.
8. **Warna chart divalidasi, bukan dikira-kira.** Kalau mengubah hex di `viz-tokens.ts`, jalankan ulang skill `dataviz` → `scripts/validate_palette.js`. Kategori nominal (disiplin, zona) pakai satu warna datar; hanya prioritas (tingkatan berurutan) yang boleh pakai ramp — dan array prioritas HARUS di-sort by `bobot` dulu sebelum dipetakan ke ramp (lihat §8.5).
9. **Testing browser di lingkungan ini kadang menembak race condition palsu.** Firing beberapa `.click()` sinkron dalam satu loop tanpa `await`/delay antar klik bisa membuat elemen DOM lama (sebelum re-render React) jadi stale reference — hasilnya klik kelihatan "gagal" padahal app-nya benar. Selalu beri jeda kecil (~50ms) antar interaksi saat menguji lewat `javascript_tool`.
10. **`localStorage` key sekarang `clashhub-data-v5`** (v1 → v2 saat master data jadi mutable, v2 → v3 saat master data pindah ke API, v3 → v4 saat clash/komentar/audit pindah ke API, v4 → v5 saat lampiran pindah ke object storage server-side). Tidak ada migrasi: kalau `JSON.parse` gagal, data lama hilang dan di-seed ulang. Kalau mengubah bentuk `LocalState` lagi, naikkan versinya.
11. **Access token TIDAK boleh dipindah ke `localStorage`.** Sekarang disimpan di variabel modul `src/lib/api/client.ts` supaya tidak terbaca XSS; ketahanan sesi datang dari cookie refresh `httpOnly`, bukan dari menyimpan token di disk.
12. **Jangan tambahkan CORS di backend.** `next.config.ts` mem-proxy `/api/*` ke `localhost:3001` lewat `rewrites`, jadi dari sisi browser semuanya same-origin dan cookie tetap first-party. Menambah CORS + `credentials: "include"` hanya akan menambah permukaan masalah tanpa manfaat.
13. **Id master data (disiplin/zona/prioritas/status/user) BUKAN uuid untuk baris hasil seed** — jangan pakai `@IsUUID()` di DTO backend untuk field yang mereferensikannya. Lihat §5 dan §8a.
14. **Mutator clash (`createClash`, `updateClashField`, `bulkUpdateClashes`, `addComment`) sekarang mengembalikan `Promise`.** Call site baru wajib `await` atau `.catch()` — kalau tidak, state loading/error di UI tidak akan pernah muncul (lihat §8b) dan galat jaringan jadi unhandled rejection yang senyap.
15. **Testing browser via `javascript_tool` di lingkungan ini: `await` top-level sering gagal dengan `SyntaxError`.** Pola yang jalan: bungkus dalam `(function() { ... })()` (IIFE, bukan arrow function kalau butuh `return`), atau untuk `fetch` async simpan hasilnya ke `window.__namaVariabel` di satu panggilan lalu baca di panggilan berikutnya. Redeclare `const`/`let` dengan nama sama di beberapa panggilan juga akan error ("Identifier ... has already been declared") karena scope tampaknya persisten antar panggilan — pakai IIFE atau nama variabel unik.
16. **`ClashesController.metrics()` (`GET /clashes/metrics`) HARUS didaftarkan sebelum `findOne()` (`GET /:id`).** NestJS/Express mencocokkan route sesuai urutan deklarasi di kelas — kalau `:id` dideklarasikan lebih dulu, request ke `/clashes/metrics` akan ketangkap sebagai `id="metrics"` alih-alih handler metrics. Kalau menambah route statis baru di bawah `/clashes`, taruh sebelum `:id`.
17. **`GET /clashes/metrics`'s `from`/`to` beda kontrak dari `GET /clashes`'s `cf`/`ct`.** `cf`/`ct` (dipakai Register) adalah tanggal saja (`YYYY-MM-DD`, dari `<input type="date">`) — backend yang menambahkan waktu akhir hari. `from`/`to` (dipakai Dashboard) adalah ISO instant lengkap (`Date#toISOString()`, sudah termasuk waktu & `Z`) — backend memakainya langsung tanpa modifikasi. Jangan disamakan formatnya kalau menyalin pola salah satu ke yang lain.
18. **`ClashesService.publishNotifications()` sengaja fire-and-forget** (`.catch()` + `Logger.warn`, bukan `await` di jalur request). Kalau Redis mati atau `queue.add()` gagal, `update()`/`bulkUpdate()` tetap harus sukses — notifikasi itu efek samping, bukan syarat clash-nya tersimpan. Jangan ubah jadi `await` tanpa try/catch, atau satu masalah Redis bisa menggagalkan semua edit clash.
19. **Sandbox agen di sesi update ke-7 tidak bisa menjalankan Docker** (`docker`/`docker compose` gagal connect ke named pipe Docker Desktop, dari Bash maupun PowerShell tool) meski Postgres yang sudah berjalan sebelumnya tetap kedeteksi (proses lain di luar sandbox). Kalau sesi berikutnya kena hal serupa, itu bukan masalah `docker-compose.yml`-nya — jalankan `docker compose up -d` dari terminal biasa di luar tool, atau minta user yang menjalankan.
20. **`NotificationPreferenceController` tidak punya `@Roles()`** — sengaja, karena setiap route-nya di-scope ke `/me` lewat `@CurrentUser()`, bukan ke id dari client. Jangan tambah parameter `userId` yang bisa dikontrol caller ke endpoint ini; itu akan membuka celah user A mengubah preferensi user B. Sejak update ke-12 juga ditandai `@SkipProjectScope()` (bukan data proyek — lihat §8x, ini sempat kelewat dan ketahuan lewat verifikasi browser, bukan test).
21. **Menambah `AuditLog.action` baru? Update `auditText()` di `clashes/[id]/page.tsx` juga.** Fungsi itu cuma punya case eksplisit untuk `"created"`; action lain jatuh ke cabang default yang mengasumsikan ada `field`/`oldValue`/`newValue` (dipakai untuk log perubahan field). Action tanpa field seperti `"imported"` (ditambah di update ke-9 untuk baris hasil impor) lolos type-check tapi merender `'... mengubah "" dari "undefined" ke "undefined".'` di runtime — cuma ketahuan lewat klik manual di browser, bukan dari test atau type-check. Ditemukan & diperbaiki di update ke-9.
22. **`docker compose` di `apps/api/docker-compose.yml` dijalankan dari CWD `apps/api`, bukan root** — `docker compose -f docker-compose.yml up -d` (bukan `-f apps/api/docker-compose.yml` dari root sambil `cwd` masih di `apps/api` dari perintah sebelumnya) akan mencoba path `apps/api/apps/api/docker-compose.yml` dan gagal "cannot find the path specified". Kalau tool Bash-mu mempertahankan `cd` antar panggilan (banyak yang begitu), cek `pwd` dulu sebelum menulis path relatif.
23. **Tool Bash otomatis yang "mencoba" set `input.files` lewat `form_input`/`.value =` pada `<input type=file>` akan gagal** (`InvalidStateError`, dilindungi browser). Yang berhasil: `javascript_tool` bikin `File` + `DataTransfer`, `input.files = dt.files`, lalu `input.dispatchEvent(new Event('change', {bubbles: true}))` — React menangkap event native ini lewat listener di root, jadi `onChange` tetap terpanggil. Dipakai untuk menguji `/import` end-to-end di update ke-9.
24. **Menambah controller/route baru sejak update ke-12? Putuskan `@SkipProjectScope()`-nya secara eksplisit, jangan asumsi.** `ProjectContextGuard` global itu deny-by-default — kalau lupa, route yang sebenarnya bukan data proyek (mis. preferensi per-user, pengaturan global) akan menolak semua request dengan 403 "Header X-Project-Id wajib disertakan" begitu ada user login (lihat §8x, kejadian nyata di sesi ini). Sebaliknya, kalau route itu memang data per-proyek (clash, disiplin, zona, import) JANGAN ditandai skip — nanti lolos tanpa scoping proyek sama sekali.
25. **`X-Project-Id` cuma dibaca dari header, bukan dari body/query.** Kalau menambah endpoint baru yang butuh tahu proyek aktif, pakai `@ActiveProject()` (nilai yang sudah diverifikasi `ProjectContextGuard`) — jangan baca `projectId` dari DTO/body/query request, itu datang dari client dan tidak diverifikasi kepemilikannya sama sekali.
26. **`CROSS_PROJECT_ROLES` (`common/constants/project-roles.ts`) itu satu-satunya tempat yang menentukan siapa bypass keanggotaan proyek.** Dipakai di dua tempat berbeda (`ProjectContextGuard` untuk cek akses, `ProjectsService.listAll/findCurrent` untuk isi daftar proyek) — kalau salah satunya diubah tanpa yang lain, Coordinator/Management/Admin bisa "diizinkan pakai proyek X" oleh guard tapi "tidak pernah melihat proyek X" di dropdown switcher (atau sebaliknya). Selalu ubah lewat konstanta ini, jangan hardcode `Role.ADMIN`/dst. di tempat baru.
27. **Resource yang beda proyek harus 404, bukan 403 — lihat §8y.** Kalau menambah resource-scoped check baru (mis. suatu saat ada model baru yang butuh isolasi proyek), ikuti pembagian: guard-level (header salah/non-member) → 403, resource-level (data ada tapi bukan di proyek aktif) → 404.

---

## 10. Menjalankan & verifikasi

Butuh **dua** server. Keduanya terdaftar di `.claude/launch.json`.

```bash
# sekali saja
docker compose -f apps/api/docker-compose.yml up -d
npm install && npm --prefix apps/api install
npm --prefix apps/api exec prisma migrate deploy
npm --prefix apps/api exec prisma db seed
```

Sejak update ke-12, seed membuat **dua** proyek (`proj-1`/MCA — data lama, tidak berubah — dan `proj-2`/GSB baru, 12 clash, 3 anggota) untuk membuktikan isolasi multi-project — lihat §5 "Otorisasi multi-project". Login sebagai `engineer@clashhub.dev` (Yanuar) untuk melihat single-project view (dia cuma anggota MCA, switcher otomatis sembunyi); login sebagai `admin@clashhub.dev` untuk melihat switcher dua proyek di sidebar.

Sejak update ke-7, `docker compose up -d` menjalankan **tiga** service, bukan dua: `postgres`, `redis` (dipakai BullMQ — sebelumnya nganggur), dan `mailhog` (kotak masuk email dev, UI di `http://localhost:8025`). Tanpa Redis hidup, `NotificationsProcessor` tidak akan memproses job (enqueue tetap jalan, tapi `.catch()` di `ClashesService.publishNotifications` cuma mencatat warning — clash update-nya sendiri tetap sukses, lihat §5 "Notifikasi async").

```bash
npm --prefix apps/api run start:dev   # API  → http://localhost:3001/api
```

```bash
npm run dev                            # Web → http://localhost:3000
```

Pemeriksaan:

```bash
npm run build && npm run lint && npm test   # frontend (build+lint+36 test — 31 lama + 5 isAssignable baru, update ke-13)
npm --prefix apps/api run build             # backend
npm --prefix apps/api run lint              # backend lint (sejak update ke-10, lihat §1) — 0 error, 35 warning (6 dari fast-xml-parser untyped sejak sebelumnya + 29 baru dari project-isolation.e2e-spec.ts's supertest/app.getHttpServer() yang untyped, update ke-12 — sama-sama didokumentasikan sebagai warning yang aman, bukan diabaikan diam-diam)
npm --prefix apps/api test                  # 103 unit+e2e test (12 suite: RolesGuard, ProjectContextGuard, AuthService, ClashesService [+isolasi proyek update ke-12, +validasi assignee Engineer-only update ke-13: 96 lama + 7 baru], NotificationsProcessor, OverdueScannerService, NotificationPreferenceService, ImportProcessor, ImportService, parser CSV/XML, MasterDataService.copyTemplate, project-isolation.e2e-spec [satu-satunya yang lewat HTTP sungguhan via supertest])
```

Docker (opsional, untuk memverifikasi image produksi — lihat README §"Menjalankan dengan Docker"):

```bash
docker build -t clashhub-web .
docker build -t clashhub-api apps/api
```

Uji beban (opsional, k6 lewat Docker — lihat §12 untuk hasil terukur update ke-11). API harus jalan native (`npm --prefix apps/api run start:dev`), bukan container, supaya gampang di-tuning berulang tanpa rebuild image:

```bash
npm --prefix apps/api run seed:load-test          # +10.000 clash bertanda externalId 'loadtest-*'
docker run --rm -v "$(pwd)/apps/api/load-test:/scripts" grafana/k6 run /scripts/register.js
docker run --rm -v "$(pwd)/apps/api/load-test:/scripts" grafana/k6 run /scripts/dashboard.js
docker run --rm -v "$(pwd)/apps/api/load-test:/scripts" grafana/k6 run /scripts/export.js
npm --prefix apps/api run seed:load-test:cleanup  # hapus lagi, data demo tidak tersentuh
```

Di Git Bash/MSYS (Windows), prefix perintah `docker run` di atas dengan `MSYS_NO_PATHCONV=1` — tanpa itu path `/scripts/...` akan salah diterjemahkan jadi path Windows lokal (lihat error `"couldn't be found on local disk"` kalau lupa).

Performa: mode dev ~5x lebih lambat dari production. Untuk menilai kelancaran UI sesungguhnya, ukur di `npm run build && npm start`.

---

## 11. Parameter URL

**Register** (`/register`): `q`, `disc`, `stat`, `prio`, `zone`, `assignee` (comma-separated), `cf`/`ct` (rentang dibuat), `overdue=1`, `sort`, `dir`, `page`.

**Dashboard** (`/dashboard`): `range` (`30d`|`90d`|`1y`|`all`), `from`, `to`.

Drill-down dashboard → register memakai parameter yang sama (termasuk `overdue=1` dari kartu KPI Overdue), jadi keduanya tetap konsisten.

---

## 12. Rekomendasi langkah berikutnya

- ~~Object storage untuk lampiran (disk lokal dulu)~~ — **selesai (update ke-6)**, lihat §5 "Lampiran: object storage lokal". Masih S3/R2-ready lewat `StorageService`, belum ada implementasi cloud-nya — kerjakan itu kalau memang butuh multi-instance/deploy.
- ~~Filter/sort/pagination server-side untuk `GET /clashes`~~ — **selesai (update ke-5)**, lihat §5 "Clashes tidak lagi di-bulk-load".
- ~~Endpoint agregasi dashboard~~ — **selesai (update ke-5)**, `GET /clashes/metrics`.
- ~~Verifikasi target performa PRD di data besar~~ — **selesai & terukur nyata (update ke-11)**. `apps/api/prisma/seed-load-test.ts` (baru, saat itu) menambah 10.000 clash ke proyek demo yang sama — **catatan update ke-12**: kalimat ini ditulis saat ClashHub masih runtime single-project (`currentProject()` yang dijelaskan di sini sudah dihapus total sejak update ke-12, lihat §5 "Otorisasi multi-project"); skrip `seed-load-test.ts` sendiri memakai Prisma langsung (bukan lewat service yang dihapus itu), jadi tidak terpengaruh, tapi kalau menjalankannya ulang sekarang hasilnya menambah 10rb clash ke `proj-1`/MCA spesifik, bukan lagi "satu-satunya proyek yang ada" — sebagai gantinya baris ditandai `externalId: 'loadtest-<n>'`, sepenuhnya reversibel lewat satu `deleteMany` scoped, sudah dibuktikan: 10.091 clash saat pengujian → 91 clash setelah `npm run seed:load-test:cleanup`, sama seperti sebelum diseed). k6 (`apps/api/load-test/*.js`, dijalankan via `docker run grafana/k6` karena tidak ada binary k6 lokal, target `host.docker.internal:3001`) mengukur ketiga target NFR PRD 4.6 di 10.091 clash nyata:
  - Register (`GET /clashes`, filter+search+sort campuran): **p(95) = 87.55ms** (target ≤1000ms)
  - Dashboard (`GET /clashes/metrics`): **p(95) = 167.28ms** (target ≤3000ms) — dugaan awal bahwa 5-pass agregasi JS di `metrics()` (`clashes.service.ts:182-283`) akan jadi bottleneck ternyata tidak terbukti di skala 10rb: margin 18x di bawah target, jadi **sengaja tidak direfactor ke SQL `groupBy`** — menambah kompleksitas tanpa manfaat terukur. Revisit kalau skala jauh melewati 10rb.
  - Export (`GET /clashes?pageSize=10000`): **p(95) = 1.03s** (target ≤10.000ms)
  - `EXPLAIN ANALYZE` pada query search (`q`, `contains`/`ILIKE` tanpa index) dan filter `disciplineId` (juga tanpa index dedicated) sama-sama memakai `Clash_projectId_createdAt_idx` yang sudah ada secara efisien (index scan backward + filter, bukan seq scan penuh) berkat pola sort-by-date+limit yang dominan di Register — **index tambahan untuk `disciplineId`/`zoneId`/`priorityId` (diminta PRD 4.2) dievaluasi dan tidak ditambahkan** karena tidak ada bukti manfaat di skala target, bukan diabaikan diam-diam.
  - **Keterbatasan lingkungan uji, dicatat jujur**: diukur di Docker Postgres lokal (kemungkinan besar seluruhnya ter-cache di memori, latensi jaringan nyaris nol, satu node, tanpa beban tulis konkuren) — angka ini sinyal nyata bahwa arsitektur query saat ini memadai untuk 10rb baris, bukan jaminan untuk semua topologi produksi (disk I/O, jaringan, load tulis bersamaan bisa beda).
  - **Temuan penting saat uji beban**: rate limiter global 100 req/menit (baru ditambah sesi ini juga) langsung kena 83% gagal 429 di percobaan k6 pertama dengan cuma 10 VU — dinaikkan ke 600 req/menit per IP setelah dikonfirmasi 100 terlalu ketat untuk trafik Register yang wajar (lihat "Rate limiting" di bawah).
- ~~Sprint 5/8 (notifikasi email + WhatsApp async)~~ — **selesai (update ke-7), dan sudah diverifikasi live (update ke-8)**, lihat §5 "Notifikasi async" dan §1. Kelima langkah verifikasi (assign→email, status change→email 2 penerima, toggle WhatsApp→`Notification(channel=WHATSAPP, isSent=true)` tanpa fallback, `OverdueScannerService.scan()` 2x→44 baru lalu 0 dedup) semuanya lolos di sesi update ke-8 dengan Docker (`postgres`+`redis`+`mailhog`) benar-benar hidup — bukan lagi cuma mock. Catatan infra: di sesi update ke-8, `docker exec clashhub-postgres psql` sempat terlihat menunjukkan database kosong (0 tabel) padahal aplikasi jalan normal dengan data lengkap — ternyata `docker exec` tidak menjangkau proses postgres yang sebenarnya dipakai (ada ambiguitas engine/context Docker Desktop di mesin ini). Kalau butuh query DB langsung dari sesi Claude Code berikutnya, jangan pakai `docker exec ... psql`; pakai `node -e` dengan `@prisma/client` dari `apps/api` (connect via `DATABASE_URL` di `.env`, TCP asli, terbukti akurat) — lihat pola query yang dipakai di verifikasi ini kalau perlu contoh.
- **WhatsApp masih mock** (`MockWhatsAppProvider` di `apps/api/src/notifications/whatsapp.service.ts`) — kalau mau kirim WhatsApp sungguhan, ganti binding `WHATSAPP_PROVIDER` di `NotificationsModule` dengan implementasi `WhatsAppProvider` yang memanggil provider asli (mis. Meta Cloud API); `NotificationsProcessor` tidak perlu diubah.
- **Email lewat MailHog, bukan SMTP produksi** — ganti `SMTP_HOST`/`SMTP_PORT` di `.env` dan tambah `auth` di `email.service.ts` kalau provider aslinya butuh kredensial.
- ~~Refresh token rotation & blacklist~~ — **selesai (update ke-11)**. Pendekatan *versioned token*, bukan tabel revocation penuh: `User.refreshTokenVersion Int @default(0)` (migrasi baru), disertakan sebagai klaim `ver` di refresh JWT (`AuthService.issueTokens()`), diverifikasi cocok dengan nilai user saat ini di `AuthService.refresh()` — token lama otomatis tidak valid begitu `refreshTokenVersion` naik, meski tanda tangan & `exp`-nya masih sah. `AuthController.logout()` (masih `@Public()` — access token pemanggil mungkin sudah kedaluwarsa saat logout, jadi tidak boleh mewajibkan auth; sebagai gantinya baca `sub` dari cookie refresh yang dibawa) memanggil `AuthService.invalidateSession()` yang menaikkan versi — best-effort, tidak pernah melempar (cookie hilang/tidak valid = tidak ada yang perlu di-invalidate). Cookie `maxAge` yang tadinya konstanta hardcoded 7 hari (`auth.controller.ts:11`, lepas dari `JWT_REFRESH_TTL`) sekarang diturunkan dari env yang sama lewat paket `ms` — diverifikasi live: 6 percobaan login salah beruntun → percobaan ke-6 kena 429 (lihat rate limiting login di bawah), token refresh lama ditolak setelah versi naik (5 test baru di `auth.service.spec.ts`).
- ~~Hardening (Sprint 11)~~ — **sebagian besar selesai (update ke-11)**:
  - **`helmet`** terpasang di `main.ts` (setelah `cookieParser()`) — header keamanan (`Content-Security-Policy`, `X-Frame-Options`, dst.) terkonfirmasi muncul di response live.
  - **Rate limiting** (`@nestjs/throttler`): default global 600 req/menit per IP (awalnya 100, dinaikkan setelah k6 sendiri kena 429 — lihat catatan uji beban di atas), `/auth/login` di-override lebih ketat (`@Throttle({ limit: 5, ttl: 60_000 })`) — diverifikasi live, percobaan ke-6 login salah beruntun kena 429. **Catatan jujur**: throttle per-IP, bukan per-user — kantor/NAT bersama dengan banyak user bisa saling memengaruhi kuota; belum jadi masalah di skala demo, tapi kandidat perbaikan (throttle per-`sub` JWT) kalau ke depan jadi masalah nyata.
  - **Global exception filter** (`common/filters/all-exceptions.filter.ts`, `@Catch()` semua): memetakan `Prisma.PrismaClientKnownRequestError` (`P2002`→409, `P2025`→404, `P2003`→400, lainnya→500 generik) dan `HttpException` bawaan Nest apa adanya, selain itu 500 generik ke client + log detail lengkap server-side + `Sentry.captureException()` (no-op kalau `SENTRY_DSN` kosong). Terdaftar via `APP_FILTER`.
  - **Validasi env saat boot** (`apps/api/src/config/env.validation.ts`, Joi): `DATABASE_URL`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` wajib, sisanya punya default. Diverifikasi live: hapus `DATABASE_URL` dari `.env` → boot gagal seketika dengan pesan `Config validation error: "DATABASE_URL" is required`, bukan gagal senyap di query pertama.
  - **Gap akses lampiran** — lihat §5 "Koreksi ProjectMemberGuard" di atas.
  - **Kredensial demo di `login/page.tsx`** — bukan dihapus, tapi dibungkus `process.env.NODE_ENV !== "production"` (bukan env var baru yang bisa lupa di-set — `NODE_ENV` otomatis dari tooling Next sendiri). Diverifikasi: teks "Akun demo" **hilang total dari bundle produksi** (dead-code elimination oleh bundler saat `false && (...)`, dicek langsung di `.next/static/chunks/*.js` hasil `npm run build`, bukan cuma disembunyikan CSS).
  - **Dependency & secret scan di CI**: `npm audit --audit-level=high` di job `api` (0 kerentanan, jadi gate keras) dan job `web` (**non-blocking**, `continue-on-error: true` — ada 2 kerentanan high yang sudah dikenal & belum bisa diperbaiki: `sharp` inherited dari `next`, butuh bump Next di luar range yang dinyatakan; `xlsx`/SheetJS, **tidak ada fix upstream sama sekali**, dan `xlsx` inti dari fitur export PRD — gate keras di sini cuma akan permanen merah tanpa jalan keluar). Job baru `security` menjalankan `gitleaks` CLI (bukan `gitleaks-action` yang butuh lisensi berbayar untuk repo org) lewat `docker run zricethezav/gitleaks`, scan seluruh riwayat git.
  - **Belum**: Prometheus (opsional secara eksplisit di sprint plan, butuh keputusan infra scrape target), deploy ke lingkungan nyata (lihat §13), uptime 99,5% (butuh monitoring produksi riil dari waktu ke waktu, tidak bisa diverifikasi dalam satu sesi coding).
- **Tes otomatis frontend** — Vitest disiapkan (`vitest.config.mts` + `vitest.setup.ts`, jsdom + Testing Library), 3 file/31 test lulus: `Badge.test.tsx`, `dashboard-metrics.test.ts`, `lookup.test.ts` (`csv.test.ts` dihapus di update ke-9 bersama `csv.ts` — konsumen terakhirnya, `import/page.tsx`, sudah tidak memakainya). Kandidat berikutnya: `allowedStatusTransitions` di `use-master-data.ts`, dan komponen React yang lebih interaktif (`RegisterView`, `BulkToolbar`, project switcher di `AppShell.tsx` — belum ada test untuk switcher meski sudah diverifikasi live, update ke-12). Backend sekarang 96 test/12 suite (86 sebelumnya + 10 baru di update ke-12: `project-context.guard.spec.ts` + `project-isolation.e2e-spec.ts`). Jalankan dengan `npm test` (`npm run test:watch` untuk mode watch).
- ~~Sprint 9 (bulk import CSV/XML + template master data)~~ — **selesai (update ke-9)**, lihat §5 "Impor massal" dan §7.
- ~~Dockerfile + CI~~ — **selesai (update ke-10)**. `.github/workflows/ci.yml` (job `web`, `api`, `docker` — build image tanpa push, hanya jalan setelah `web`+`api` lulus), `Dockerfile` root (Next.js, `output: "standalone"`, multi-stage, non-root), `apps/api/Dockerfile` (NestJS, `prisma generate` di stage builder, client Prisma di-copy eksplisit ke stage prod-deps supaya tidak hilang kena `npm ci --omit=dev` yang fresh), `docker-compose.prod.yml` (web+api+postgres+redis, terpisah dari `apps/api/docker-compose.yml` yang tetap dipakai untuk dev). Kedua image sudah dibangun **dan dijalankan** lokal di sesi ini (bukan cuma `docker build` sukses) — web: container boot, `/login` respons 200; api: Nest app boot sampai semua module (`AppModule`, `AuthModule`, dst.) ter-inisialisasi. **Catatan jujur**: workflow CI belum pernah benar-benar dieksekusi di GitHub karena sesi ini tidak melakukan `git push` — perintah di dalamnya divalidasi dengan menjalankan urutan yang sama secara manual (lint, test, build, docker build), bukan lewat `act` (tidak terpasang di sandbox). Push & lihat run pertama adalah langkah pertama sesi berikutnya kalau CI mau benar-benar tervalidasi di GitHub.
- ~~Lint backend tidak pernah benar-benar jalan~~ — **selesai (update ke-10)**. `apps/api/eslint.config.mjs` baru (flat config ESLint 10 + typescript-eslint, `recommendedTypeChecked`); `npm --prefix apps/api run lint` sekarang 0 error (6 warning tersisa, semuanya dari `no-explicit-any`/`no-unsafe-*` pada hasil `fast-xml-parser.parse()` yang memang untyped — didokumentasikan sebagai `warn` yang disengaja di komentar config, bukan diabaikan diam-diam). Rule `unbound-method` dan `no-unnecessary-type-assertion` dimatikan khusus untuk `*.spec.ts` — keduanya false-positive sistematis pada pola Jest `expect(mock.method).toHaveBeenCalledWith(...)`, bukan bug. 5 temuan nyata di kode aplikasi (bukan test) diperbaiki: import mati (`BulkUpdatePatchDto` di `clashes.service.ts`), double-cast berlebih (`import.processor.ts`), floating promise di `bootstrap()` (`main.ts`, sekarang `.catch()` + `process.exit(1)`), `no-base-to-string` di `xml.parser.ts` (helper `stringifyCell()` baru, whitelist tipe primitif eksplisit alih-alih `String(unknown)` mentah), dan `async` tanpa `await` di `MockWhatsAppProvider.send()`. 79 test backend tetap lulus setelah semua perbaikan ini.
- ~~Worktree nyasar~~ — **dihapus (update ke-10)** lewat `git worktree remove` (bukan `rm -rf` manual) setelah dikonfirmasi bersih (`git status` kosong). `git worktree list` sekarang cuma satu baris. `.claude/**` juga ditambahkan ke `globalIgnores` di `eslint.config.mjs` root sebagai sabuk pengaman kalau ada worktree/scratch serupa di masa depan.
- ~~Otorisasi multi-project~~ — **selesai (update ke-12)**, lihat §5 "Otorisasi multi-project", §7, §9.24-27. **Yang masih bisa dikerjakan lebih lanjut, bukan blocker**:
  - UI kelola anggota di `/admin/projects` (`select` "Pilih user…") belum ada search/filter — akan tidak nyaman kalau jumlah user di satu perusahaan jadi ratusan. Cukup untuk skala demo saat ini.
  - `ImportService.getJob()` masih otorisasi berbasis "pembuat job atau Admin" (bukan berbasis membership proyek) — sengaja dipertahankan apa adanya (lebih ketat, bukan lebih longgar) karena di luar scope permintaan; kalau nanti mau diselaraskan supaya Coordinator lain di proyek yang sama juga bisa lihat job, itu perubahan kebijakan produk, bukan perbaikan bug.
  - Belum ada test untuk endpoint membership (`GET/POST/DELETE /projects/:projectId/members`) di level backend — sudah diverifikasi live lewat browser (tambah/hapus anggota GSB, lihat §5) tapi belum ada `*.spec.ts` khusus untuknya. Kandidat test berikutnya kalau area ini disentuh lagi.
  - `Status`/`Priority` sengaja **tetap global** lintas proyek (keputusan eksplisit user selama sesi ini, bukan keterbatasan teknis) — kalau produk nanti butuh status/prioritas berbeda per proyek, itu perubahan schema (`projectId` di kedua model) + migrasi data, bukan sekadar ubah guard.

---

## 13. Deploy & rollback (update ke-11)

**Belum pernah dijalankan ke host nyata di sesi mana pun** — bagian ini adalah dokumentasi/kesiapan, bukan laporan deploy yang sudah terjadi. Ditulis supaya sesi berikutnya (atau siapa pun yang punya akses ke VPS/cloud target) tinggal ikuti langkahnya, bukan mendesain ulang dari nol.

### Deploy

Prasyarat: Docker + Docker Compose di host target, DNS/reverse proxy kalau perlu HTTPS (aplikasi sendiri tidak menangani TLS — lihat Sprint 11 asli soal ini, belum dikerjakan, lihat §12).

```bash
git clone <repo-ini> && cd WebApp
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env: WAJIB ganti JWT_ACCESS_SECRET & JWT_REFRESH_SECRET dari placeholder dev
# (lihat SMTP_*/REDIS_*/DATABASE_URL juga kalau tidak pakai default docker-compose.prod.yml)

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Web di `:3000`, API di `:3001/api`. `docker-compose.prod.yml` **tidak** menjalankan migrasi otomatis saat container start — sengaja, supaya migrasi selalu langkah eksplisit yang bisa dipantau, bukan bagian dari `up -d` yang gagal senyap kalau ada masalah.

Verifikasi pasca-deploy: `curl <host>:3001/api/health/ready` (§5/§9 Observability, update ke-11) harus 200 sebelum menganggap deploy sukses — ini cek DB **dan** Redis, bukan cuma proses hidup.

### Rollback

Migrasi Prisma **tidak otomatis reversible** — `prisma migrate deploy` tidak punya lawan `undo` bawaan yang aman untuk migrasi yang sudah mengubah data (cuma migrasi struktur murni yang gampang di-reverse manual). Jadi:

1. **Kalau migrasi baru BELUM dijalankan** (gagal sebelum `prisma migrate deploy`, atau image baru belum di-deploy sama sekali): cukup `docker compose -f docker-compose.prod.yml up -d` dengan image/tag sebelumnya. Aman, tidak ada state DB yang berubah.
2. **Kalau migrasi baru SUDAH dijalankan** dan perlu rollback aplikasi: **jangan** downgrade image ke versi lama tanpa juga menangani skema — kode lama tidak tahu kolom/tabel baru dan mungkin akan error di query yang menyentuhnya (atau lebih buruk, diam-diam salah). Opsi realistis:
   - Tulis migrasi "forward" baru yang membatalkan efeknya (bukan `migrate down`) — pendekatan yang lebih aman dan yang direkomendasikan Prisma sendiri.
   - Atau restore dari backup (`scripts/backup-db.sh`, lihat di bawah) kalau rollback-nya darurat dan kehilangan data sejak backup terakhir bisa diterima.
3. Backup **sebelum** menjalankan migrasi produksi apa pun — bukan opsional. `./apps/api/scripts/backup-db.sh` (default `CONTAINER=clashhub-postgres`; untuk stack produksi set `CONTAINER=clashhub-postgres-prod`, sudah didaftarkan di `docker-compose.prod.yml`).

### Backup database

`apps/api/scripts/backup-db.sh` — `pg_dump` format custom (`-F c`, terkompresi, bisa direstore sebagian lewat `pg_restore`) lewat `docker exec` ke container Postgres (bukan butuh client Postgres lokal). Retensi default 7 hari (`RETENTION_DAYS`), lokasi default `apps/api/backups/` (di-gitignore). Sudah diverifikasi jalan sungguhan di sesi ini terhadap container dev (`clashhub-postgres`) — dump valid (`PGDMP` magic header terkonfirmasi).

```bash
./apps/api/scripts/backup-db.sh                                    # container dev
CONTAINER=clashhub-postgres-prod ./apps/api/scripts/backup-db.sh   # container produksi

# restore:
docker exec -i <container> pg_restore -U clashuser -d clashhub_db --clean --if-exists < apps/api/backups/clashhub_<timestamp>.dump
```

Jadwalkan lewat cron host (`crontab -e`, contoh ada di komentar skrip) **atau** aktifkan service `backup` yang sudah ada (dikomentari, opt-in) di `docker-compose.prod.yml` — tidak keduanya, pilih satu supaya tidak dobel backup. Skrip ini bukan pengganti snapshot/backup level provider cloud (mis. RDS automated backups) kalau nanti pindah ke managed Postgres — cukup memadai untuk self-hosted `docker-compose.prod.yml`.
