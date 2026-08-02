# ClashHub — Handoff Progress

**Tanggal:** 2 Agustus 2026 (update ke-5)
**Status:** Frontend selesai. **Sprint 1 + `ClashesModule` (Sprint 2/3/4) backend selesai dan tersambung**: auth JWT + argon2, RBAC, CRUD user/proyek/master-data, dan clash/komentar/audit log semuanya berjalan di NestJS + PostgreSQL dengan RBAC ditegakkan server-side. Fase hybrid **berakhir** untuk domain inti — hanya lampiran dan preferensi notifikasi yang masih di `localStorage` (menunggu object storage & modul notifikasi). **Update ke-5:** `GET /clashes` sekarang filter/sort/pagination server-side, dan `GET /clashes/metrics` (baru) menghitung KPI/tren/sebaran dashboard di server — lihat §12 lama, sekarang selesai. Konsekuensinya, `DataContext` tidak lagi memuat semua clash di bootstrap (lihat §5 "Clashes tidak lagi di-bulk-load").
**Lokasi proyek:** `D:\WebApp`

Dokumen ini untuk melanjutkan pengerjaan di sesi/chat baru. Baca ini dulu sebelum menulis kode.

> **Menjalankan sekarang butuh DUA server:** API di `localhost:3001` (`npm --prefix apps/api run start:dev`) dan web di `localhost:3000` (`npm run dev`). Keduanya terdaftar di `.claude/launch.json`. Tanpa API hidup, login gagal dan seluruh master data kosong.

---

## 1. Konteks

ClashHub adalah web platform manajemen clash & issue koordinasi BIM. Dokumen sumber ada di repo:

| Dokumen | Isi |
|---|---|
| `ClashHub_PRD.md` | Product Requirements — persona, user story, acceptance criteria, NFR |
| `ClashHub_ERD.md` | Entity Relationship Diagram (PostgreSQL) |
| `ClashHub_Sprint_Plan.md` | 12 sprint (0–11) + prompt siap-pakai per sprint |

**Update ke-5 (server-side pagination + agregasi dashboard):** `GET /clashes` menerima query params (`q`, `disc`/`stat`/`prio`/`zone`/`assignee`, `reporterId`, `cf`/`ct`, `overdue`, `sort`, `dir`, `page`, `pageSize`) dan mengembalikan `{ data, total }` — filter/sort/pagination Register sekarang dihitung Prisma, bukan array JS di browser. Endpoint baru `GET /clashes/metrics` menghitung KPI/tren mingguan/sebaran dashboard di server (port dari `computeMetrics()` di `dashboard-metrics.ts`), jadi `DashboardView` tidak lagi butuh seluruh array clash. Konsekuensi arsitektur: `DataContext` **berhenti memuat semua clash di bootstrap** — `master.clashes` (array) diganti `master.clashesById` (cache kecil, terisi on-demand oleh `loadClashDetail`/`createClash`/`updateClashField`). Register, Dashboard, dan "Clash Saya" masing-masing fetch sendiri dari `/clashes`; hanya halaman detail clash yang masih memakai `clashesById`. Lihat §5 "Clashes tidak lagi di-bulk-load" untuk detail lengkap.

**Update sejak handoff ke-3 (`ClashesModule`):** clash, komentar, dan audit log pindah dari `localStorage` ke NestJS + PostgreSQL. Backend baru: `apps/api/src/clashes/` (`ClashesController`/`ClashesService`/DTO) dengan 6 endpoint (list, detail, create, update, bulk update, comment) dan RBAC penuh di service layer — bukan cuma `@Roles()` — termasuk aturan "Engineer hanya boleh edit item sendiri" dan "Engineer hanya boleh maju status 1 langkah, tidak boleh menutup". Audit log dan `uniqueCode` sekarang dibuat server-side (tidak bisa dipalsukan client). Index `Clash` yang tadinya satu composite 8-kolom diganti 4 index yang benar-benar dipakai. Frontend: `data-context.tsx` tidak lagi menyimpan clash/komentar/audit di localStorage; `mock-data.ts` **dihapus total**; `localStorage` sekarang hanya berisi lampiran (sesi-only) dan preferensi notifikasi.

**Update sebelumnya (handoff ke-2/3, Sprint 1):** backend NestJS di `apps/api/` jadi backend resmi. AuthModule (JWT access 15m + refresh 7d di cookie `httpOnly`, password argon2id), `RolesGuard` + `@Roles()` + `ProjectMemberGuard` (sekarang **benar-benar dipakai** oleh route clash), modul `users`/`projects`/`master-data`. Frontend punya lapisan `src/lib/api/`.

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
│   │   ├── projects/page.tsx   edit nama/kode proyek (single-project, bukan multi-tenant)
│   │   └── master-data/page.tsx  tab Disiplin/Zona/Prioritas/Status
│   └── clashes/
│       ├── new/page.tsx        form input + upload lampiran SUNGGUHAN (File asli, object URL)
│       └── [id]/page.tsx       detail, triase, komentar, audit trail, pratinjau lampiran
├── components/
│   ├── AppShell.tsx             sidebar + nav (nav & menu Admin difilter per peran)
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
    │                             notifikasi yang masih localStorage (lihat §5)
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
├── app.module.ts                 JwtAuthGuard & RolesGuard didaftarkan sbg APP_GUARD global
├── auth/                         login/refresh/logout/me, JwtStrategy, AuthService
├── common/
│   ├── decorators/               @Public(), @Roles(), @CurrentUser()
│   ├── guards/                   JwtAuthGuard, RolesGuard, ProjectMemberGuard (dipakai di clashes)
│   └── user.view.ts              serializer user (passwordHash tidak pernah ikut)
├── users/  ·  projects/  ·  master-data/     controller + service + dto
├── clashes/                      clash + komentar + audit log
│   ├── clashes.controller.ts     GET /clashes (filter/sort/pagination), GET /clashes/metrics
│   │                             (HARUS didaftarkan sebelum GET /:id — lihat komentar di file),
│   │                             GET /:id, POST, PATCH /:id, POST /bulk, POST /:id/comments
│   ├── clashes.service.ts        RBAC per-field, generator uniqueCode, audit log server-side,
│   │                             list() (where/orderBy/skip/take Prisma), metrics() (port dari
│   │                             computeMetrics() frontend — keduanya harus tetap sinkron)
│   └── clashes.service.spec.ts   17 test: RBAC, transisi status, closedAt, audit, uniqueCode,
│                                  list() filter/sort/pagination, metrics() agregasi
└── prisma/                       PrismaService
```

**localStorage key:** `clashhub-data-v4` (naik dari v3 — clash/komentar/audit pindah ke API, bentuk `LocalState` menyusut jadi `{ attachments, notificationPreferences }`). Key `clashhub-auth-user-id` **sudah tidak dipakai** — sesi sekarang bersandar pada cookie `httpOnly` `clashhub_refresh`.

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

### Lampiran: File asli, tapi sesi-only (belum berubah)

`NewClashInput.attachments[].file?: File` — form input mengirim `File` sungguhan, bukan cuma metadata, tapi lampiran **belum** ikut pindah ke backend (`ClashesModule` sengaja tidak mencakup ini — lihat §12). Setelah clash dibuat di server, `data-context.tsx` men-generate `URL.createObjectURL()` per lampiran dan menyimpannya di `attachmentPreviewUrls` (state React biasa) + metadata lampiran di `localStorage`. Blob URL tidak valid lagi setelah reload. Halaman detail menampilkan thumbnail gambar + link unduh kalau preview URL tersedia; kalau tidak (lampiran lama / setelah reload), tampil pesan jujur "pratinjau tidak tersedia setelah reload".

---

## 6. RBAC yang ditegakkan

| Peran | Register | Bulk update | Export | Buat clash | Edit item | Komentar | Dashboard | Admin | Import CSV |
|---|---|---|---|---|---|---|---|---|---|
| **Engineer** | ✅ | ❌ | ✅ | ✅ | Item sendiri, status maju 1 langkah saja | ✅ | ❌ | ❌ | ❌ |
| **Coordinator** | ✅ | ✅ | ✅ | ✅ | Penuh | ✅ | ✅ | ❌ | ✅ |
| **Management** | ✅ baca-saja | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | Penuh | ✅ | ✅ | ✅ | ✅ |

Aturan terpusat di frontend: `src/lib/lookup.ts` (`canEditClash`, `canComment`) + `src/lib/use-master-data.ts` (`allowedStatusTransitions`) + guard `use-require-auth.ts`/`use-require-admin.ts`.

**Sejak Sprint 1, RBAC juga ditegakkan di server** — guard frontend kini sekadar UX, bukan satu-satunya pertahanan. `RolesGuard` di NestJS menolak dengan 403, dan `JwtAuthGuard` global menolak request tanpa token dengan 401. **Sejak `ClashesModule`, ini juga berlaku untuk kolom "Edit item"** — bukan cuma peran, tapi juga "item sendiri" dan "status maju 1 langkah" ditegakkan di `ClashesService`, sudah diverifikasi lewat `fetch()` langsung yang melewati UI. Tabel endpoint lengkap ada di `apps/api/README.md`.

---

## 7. Status per sprint (Sprint Plan asli)

| Sprint | Fokus | Status | Catatan |
|---|---|---|---|
| 0 | Fondasi backend | ✅ Selesai | NestJS + Prisma + PostgreSQL, 2 migrasi ter-apply, seed idempoten, `/api/health` |
| 1 | Auth, RBAC, Administrasi | ✅ Selesai | JWT + argon2id, RolesGuard/ProjectMemberGuard, CRUD user/proyek/master-data, **frontend tersambung**, 12 unit test lulus |
| 2 | Input clash + lampiran | 🟢 Clash selesai, lampiran belum | Clash dari DB via `ClashesModule`; lampiran masih localStorage (belum ada object storage) |
| 3 | Clash Register | ✅ Selesai | Data clash dari DB, filter/sort/pagination server-side (`GET /clashes`, update ke-5) |
| 4 | Detail, komentar, audit, triase | 🟢 Selesai (1 gap kecil) | Komentar & audit dari DB (lazy-load per clash), RBAC field-level di server, audit trail server-generated — tapi tab Riwayat tidak refresh otomatis setelah edit di sesi yang sama, butuh reload (lihat task terpisah yang di-spawn saat verifikasi update ke-5, belum dikerjakan) |
| 5 | Notifikasi email async | ❌ Belum | Butuh Redis + BullMQ (Redis ada di compose, belum dijalankan) |
| 6 | Dashboard Manajemen | ✅ Selesai | Agregasi (KPI/tren/sebaran) dihitung server-side (`GET /clashes/metrics`, update ke-5) |
| 7 | Export Excel/PDF + Bulk update | ✅ Selesai | Export client-side (SheetJS + jsPDF); bulk update sekarang lewat `POST /clashes/bulk` |
| 8 | WhatsApp + preferensi kanal | 🟢 Frontend selesai | Kolom `whatsappNumber` sudah ada di skema; preferensi masih di localStorage |
| 9 | Bulk import CSV/XML | 🟢 Frontend selesai (CSV saja) | Commit sekarang lewat `POST /clashes` async per baris (bukan localStorage); XML di-scope-cut |
| 10 | Fitur AI (opsional) | ❌ Belum | Butuh eval harness + AI asli |
| 11 | Hardening, performa, deploy | ❌ Belum | |

**Langkah berikutnya yang paling masuk akal:** lihat §12.

---

## 8. Bug & jebakan yang ditemukan (lintas sesi)

Dicatat supaya tidak terulang kalau menyentuh file yang sama.

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
10. **`localStorage` key sekarang `clashhub-data-v4`** (v1 → v2 saat master data jadi mutable, v2 → v3 saat master data pindah ke API, v3 → v4 saat clash/komentar/audit pindah ke API). Tidak ada migrasi: kalau `JSON.parse` gagal, data lama hilang dan di-seed ulang. Kalau mengubah bentuk `LocalState` lagi, naikkan versinya.
11. **Access token TIDAK boleh dipindah ke `localStorage`.** Sekarang disimpan di variabel modul `src/lib/api/client.ts` supaya tidak terbaca XSS; ketahanan sesi datang dari cookie refresh `httpOnly`, bukan dari menyimpan token di disk.
12. **Jangan tambahkan CORS di backend.** `next.config.ts` mem-proxy `/api/*` ke `localhost:3001` lewat `rewrites`, jadi dari sisi browser semuanya same-origin dan cookie tetap first-party. Menambah CORS + `credentials: "include"` hanya akan menambah permukaan masalah tanpa manfaat.
13. **Id master data (disiplin/zona/prioritas/status/user) BUKAN uuid untuk baris hasil seed** — jangan pakai `@IsUUID()` di DTO backend untuk field yang mereferensikannya. Lihat §5 dan §8a.
14. **Mutator clash (`createClash`, `updateClashField`, `bulkUpdateClashes`, `addComment`) sekarang mengembalikan `Promise`.** Call site baru wajib `await` atau `.catch()` — kalau tidak, state loading/error di UI tidak akan pernah muncul (lihat §8b) dan galat jaringan jadi unhandled rejection yang senyap.
15. **Testing browser via `javascript_tool` di lingkungan ini: `await` top-level sering gagal dengan `SyntaxError`.** Pola yang jalan: bungkus dalam `(function() { ... })()` (IIFE, bukan arrow function kalau butuh `return`), atau untuk `fetch` async simpan hasilnya ke `window.__namaVariabel` di satu panggilan lalu baca di panggilan berikutnya. Redeclare `const`/`let` dengan nama sama di beberapa panggilan juga akan error ("Identifier ... has already been declared") karena scope tampaknya persisten antar panggilan — pakai IIFE atau nama variabel unik.
16. **`ClashesController.metrics()` (`GET /clashes/metrics`) HARUS didaftarkan sebelum `findOne()` (`GET /:id`).** NestJS/Express mencocokkan route sesuai urutan deklarasi di kelas — kalau `:id` dideklarasikan lebih dulu, request ke `/clashes/metrics` akan ketangkap sebagai `id="metrics"` alih-alih handler metrics. Kalau menambah route statis baru di bawah `/clashes`, taruh sebelum `:id`.
17. **`GET /clashes/metrics`'s `from`/`to` beda kontrak dari `GET /clashes`'s `cf`/`ct`.** `cf`/`ct` (dipakai Register) adalah tanggal saja (`YYYY-MM-DD`, dari `<input type="date">`) — backend yang menambahkan waktu akhir hari. `from`/`to` (dipakai Dashboard) adalah ISO instant lengkap (`Date#toISOString()`, sudah termasuk waktu & `Z`) — backend memakainya langsung tanpa modifikasi. Jangan disamakan formatnya kalau menyalin pola salah satu ke yang lain.

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

```bash
npm --prefix apps/api run start:dev   # API  → http://localhost:3001/api
```

```bash
npm run dev                            # Web → http://localhost:3000
```

Pemeriksaan:

```bash
npm run build && npm run lint          # frontend
npm --prefix apps/api run build        # backend
npm --prefix apps/api test             # 29 unit test (RolesGuard, AuthService, ClashesService)
```

Performa: mode dev ~5x lebih lambat dari production. Untuk menilai kelancaran UI sesungguhnya, ukur di `npm run build && npm start`.

---

## 11. Parameter URL

**Register** (`/register`): `q`, `disc`, `stat`, `prio`, `zone`, `assignee` (comma-separated), `cf`/`ct` (rentang dibuat), `overdue=1`, `sort`, `dir`, `page`.

**Dashboard** (`/dashboard`): `range` (`30d`|`90d`|`1y`|`all`), `from`, `to`.

Drill-down dashboard → register memakai parameter yang sama (termasuk `overdue=1` dari kartu KPI Overdue), jadi keduanya tetap konsisten.

---

## 12. Rekomendasi langkah berikutnya

- **Object storage untuk lampiran (disk lokal dulu)** — prasyarat agar lampiran bertahan setelah reload (lihat §5 "Lampiran"). `Attachment.fileUrl` sudah ada di skema tapi belum ada yang mengisinya. Rencana: `apps/api/uploads/` + endpoint upload multipart + endpoint download terproteksi, di balik abstraksi storage supaya gampang pindah ke S3/R2 nanti.
- ~~Filter/sort/pagination server-side untuk `GET /clashes`~~ — **selesai (update ke-5)**, lihat §5 "Clashes tidak lagi di-bulk-load".
- ~~Endpoint agregasi dashboard~~ — **selesai (update ke-5)**, `GET /clashes/metrics`.
- **Riwayat (audit trail) tidak refresh otomatis setelah edit** — ditemukan saat verifikasi browser update ke-5: `updateClashField()` di `data-context.tsx` menulis clash yang diperbarui ke `clashesById`, tapi tidak memuat ulang audit log clash itu, jadi tab "Riwayat" di halaman detail baru menunjukkan baris baru setelah reload manual. Server-nya sudah benar (baris `AuditLog` tertulis saat itu juga). Bug pre-existing, bukan regresi dari update ke-5 (dikonfirmasi lewat `git diff` — `updateClashField` memang belum pernah menyentuh `auditLogs`). Task terpisah sudah di-spawn untuk ini, belum dikerjakan.
- **Verifikasi target performa PRD di data besar (masih relevan meski pagination sudah server-side)** — seed sekarang 87-90 clash; setelah update ke-5, `GET /clashes` dan `/clashes/metrics` sudah query Prisma langsung (bukan muat-semua-lalu-filter-di-JS), tapi belum ada index/query tuning khusus atau load test terhadap target 10.000 clash. Itu tetap pekerjaan Sprint 11.
- **Sprint 5/8 (notifikasi email + WhatsApp async)** — jalankan Redis dari `docker-compose.yml`, tambah BullMQ. Skema `Notification` & `NotificationPreference` sudah siap, termasuk `whatsappNumber`. `notificationPreferences` juga perlu dipindah dari localStorage ke API (pola sama seperti `ClashesModule`).
- **Refresh token rotation & blacklist** — saat ini refresh token hanya diverifikasi tanda tangannya; logout menghapus cookie tapi token yang sudah dicuri masih valid sampai kedaluwarsa. Belum kritis untuk demo, wajib sebelum produksi (Sprint 11).
- **Hardening (Sprint 11)** — belum ada global exception filter (error Prisma mentah seperti `P2002`/`P2003` di luar jalur yang sudah ditangani bisa bocor jadi 500), belum ada logging, belum ada rate limit di `/auth/login`, belum ada `helmet`, belum ada validasi skema env (`DATABASE_URL` hilang baru ketahuan saat query pertama, bukan saat boot). Kredensial demo di-hardcode di `login/page.tsx` — wajib dihapus sebelum deploy sungguhan.
- **Tes otomatis frontend** — masih nol. Kandidat kuat: `dashboard-metrics.ts` (fungsi murni, sekarang tidak dipanggil `DashboardView` tapi masih dijaga sebagai referensi formula untuk `ClashesService.metrics()`) dan `allowedStatusTransitions` di `use-master-data.ts`. Backend sudah punya 29 test (12 lama + 14 `ClashesService` RBAC/create + 3 `list()`/`metrics()`).
- **Dockerfile + CI** — belum ada sama sekali. Deliverable CI Sprint 0 sebenarnya belum terpenuhi.
