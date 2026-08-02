# ClashHub — Handoff Progress

**Tanggal:** 2 Agustus 2026 (update ke-3)
**Status:** Frontend selesai. **Sprint 1 backend selesai dan sudah tersambung**: auth JWT + argon2, RBAC, dan CRUD user/proyek/master-data berjalan di NestJS + PostgreSQL. Clash, komentar, audit log, lampiran, dan preferensi notifikasi **masih di `localStorage`** (fase hybrid).
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

**Update sejak handoff ke-2 (Sprint 1):** backend NestJS di `apps/api/` sudah jadi backend resmi dan **tersambung ke frontend**. Yang dibangun: AuthModule (JWT access 15m + refresh 7d di cookie `httpOnly`, password argon2id), `RolesGuard` + `@Roles()` + `ProjectMemberGuard`, dan modul `users`/`projects`/`master-data`. Di sisi frontend ditambahkan lapisan `src/lib/api/`, dan `auth-context.tsx` + `data-context.tsx` sekarang bicara ke API — **tanpa mengubah satu pun tipe domain atau komponen** (lihat §5).

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
│   │   ├── RegisterView.tsx     tabel + filter + sort + pagination + bulk + export
│   │   ├── FilterChips.tsx      chip group (memoized)
│   │   └── BulkToolbar.tsx      toolbar bulk update + modal konfirmasi
│   └── dashboard/
│       ├── DashboardView.tsx
│       ├── ChartPieces.tsx
│       └── viz-tokens.ts
└── lib/
    ├── api/                      LAPISAN BARU (Sprint 1)
    │   ├── client.ts             apiFetch/apiGet/apiPost/apiPatch, login, logout,
    │   │                         restoreSession. Access token disimpan DI MEMORI
    │   │                         (bukan localStorage). Retry sekali lewat /auth/refresh saat 401.
    │   ├── mappers.ts            SATU-SATUNYA tempat terjemahan Inggris ↔ Indonesia
    │   └── types.ts              bentuk respons API mentah (name/role/weight/sequence)
    ├── types.ts                 tipe domain — TIDAK BERUBAH di Sprint 1
    ├── mock-data.ts              INITIAL_* + generateSeedData (clash dummy). INITIAL_* kini
    │                             hanya dipakai generateSeedData; master data datang dari API.
    ├── data-context.tsx          HYBRID: master data dari API, clash dkk dari localStorage
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
│   ├── guards/                   JwtAuthGuard, RolesGuard, ProjectMemberGuard
│   └── user.view.ts              serializer user (passwordHash tidak pernah ikut)
├── users/  ·  projects/  ·  master-data/     controller + service + dto
└── prisma/                       PrismaService
```

**localStorage key:** `clashhub-data-v3` (naik dari v2 — isinya menyusut, master data pindah ke API). Key `clashhub-auth-user-id` **sudah tidak dipakai** — sesi sekarang bersandar pada cookie `httpOnly` `clashhub_refresh`.

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

**Reset data demo:**
```js
localStorage.clear(); location.reload();   // hanya clash/komentar/audit/lampiran
```
Master data & user ada di database — untuk mengembalikannya jalankan `npx prisma db seed` di `apps/api` (idempoten, memakai `upsert`).

---

## 5. Arsitektur data — baca ini sebelum mengubah apa pun

### Fase HYBRID — separuh dari API, separuh dari localStorage

Ini hal terpenting yang harus dipahami sebelum menyentuh `data-context.tsx`:

| Dari API (PostgreSQL) | Masih di `localStorage` |
|---|---|
| `project`, `users`, `disciplines`, `zones`, `statuses`, `priorities` | `clashes`, `comments`, `auditLogs`, `attachments`, `notificationPreferences` |

**Yang membuat kedua paruh ini nyambung:** `apps/api/prisma/seed.ts` sengaja memakai **id eksplisit yang sama persis dengan `mock-data.ts`** (`proj-1`, `u-eng`, `disc-ars`, `st-open`, `pr-low`, `zone-1`, …), bukan uuid acak. Clash mock menyimpan `disciplineId: "disc-ars"`; kalau id di database acak, seluruh 87 clash jadi orphan dan Register + Dashboard ikut kosong. **Jangan pernah mengganti id seed itu dengan uuid selama clash masih di localStorage.**

### Master data dibaca lewat useData(), bukan konstanta

- Untuk MEMBACA master data di komponen: pakai `useData()` (array live: `disciplines`, `zones`, `statuses`, `priorities`, `users`, `project`) atau `useMasterDataLookups()` dari `use-master-data.ts`.
- **Jangan pernah** import `INITIAL_DISCIPLINES`/`INITIAL_ZONES`/dst. langsung dari `mock-data.ts` di komponen manapun — sekarang itu cuma dipakai `generateSeedData()` untuk clash dummy.

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

### Lampiran: File asli, tapi sesi-only

`NewClashInput.attachments[].file?: File` — form input sekarang mengirim `File` sungguhan, bukan cuma metadata. `data-context.tsx` men-generate `URL.createObjectURL()` per lampiran dan menyimpannya di `attachmentPreviewUrls` (state React biasa, **bukan** di `localStorage` — blob URL tidak valid lagi setelah reload). Halaman detail menampilkan thumbnail gambar + link unduh kalau preview URL tersedia; kalau tidak (lampiran lama / setelah reload), tampil pesan jujur "pratinjau tidak tersedia setelah reload". Ini sudah diverifikasi end-to-end (upload → reload → pesan muncul).

---

## 6. RBAC yang ditegakkan

| Peran | Register | Bulk update | Export | Buat clash | Edit item | Komentar | Dashboard | Admin | Import CSV |
|---|---|---|---|---|---|---|---|---|---|
| **Engineer** | ✅ | ❌ | ✅ | ✅ | Item sendiri, status maju 1 langkah saja | ✅ | ❌ | ❌ | ❌ |
| **Coordinator** | ✅ | ✅ | ✅ | ✅ | Penuh | ✅ | ✅ | ❌ | ✅ |
| **Management** | ✅ baca-saja | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | Penuh | ✅ | ✅ | ✅ | ✅ |

Aturan terpusat di frontend: `src/lib/lookup.ts` (`canEditClash`, `canComment`) + `src/lib/use-master-data.ts` (`allowedStatusTransitions`) + guard `use-require-auth.ts`/`use-require-admin.ts`.

**Sejak Sprint 1, RBAC juga ditegakkan di server** — guard frontend kini sekadar UX, bukan satu-satunya pertahanan. `RolesGuard` di NestJS menolak dengan 403, dan `JwtAuthGuard` global menolak request tanpa token dengan 401. Tabel endpoint lengkap ada di `apps/api/README.md`.

---

## 7. Status per sprint (Sprint Plan asli)

| Sprint | Fokus | Status | Catatan |
|---|---|---|---|
| 0 | Fondasi backend | ✅ Selesai | NestJS + Prisma + PostgreSQL, 2 migrasi ter-apply, seed idempoten, `/api/health` |
| 1 | Auth, RBAC, Administrasi | ✅ Selesai | JWT + argon2id, RolesGuard/ProjectMemberGuard, CRUD user/proyek/master-data, **frontend tersambung**, 12 unit test lulus |
| 2 | Input clash + lampiran | 🟢 Frontend selesai | Clash masih di localStorage; lampiran belum punya object storage |
| 3 | Clash Register | 🟢 Frontend selesai | Data clash belum dari DB |
| 4 | Detail, komentar, audit, triase | 🟢 Frontend selesai | Idem |
| 5 | Notifikasi email async | ❌ Belum | Butuh Redis + BullMQ (Redis ada di compose, belum dijalankan) |
| 6 | Dashboard Manajemen | 🟢 Frontend selesai | Agregasi masih di client dari data localStorage |
| 7 | Export Excel/PDF + Bulk update | ✅ Selesai | Export client-side (SheetJS + jsPDF) |
| 8 | WhatsApp + preferensi kanal | 🟢 Frontend selesai | Kolom `whatsappNumber` sudah ada di skema; preferensi masih di localStorage |
| 9 | Bulk import CSV/XML | 🟢 Frontend selesai (CSV saja) | XML di-scope-cut |
| 10 | Fitur AI (opsional) | ❌ Belum | Butuh eval harness + AI asli |
| 11 | Hardening, performa, deploy | ❌ Belum | |

**Langkah berikutnya yang paling masuk akal: `ClashesModule`** (clash + komentar + audit log + lampiran) lalu pindahkan lima key `localStorage` yang tersisa ke API. Polanya sudah terbukti di Sprint 1 — tinggal diulang. Setelah itu `localStorage` bisa dihapus sepenuhnya dan `mock-data.ts` ikut dibuang.

---

## 8. Bug & jebakan yang ditemukan (lintas sesi)

Dicatat supaya tidak terulang kalau menyentuh file yang sama.

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
10. **`localStorage` key sekarang `clashhub-data-v3`** (v1 → v2 saat master data jadi mutable, v2 → v3 saat master data pindah ke API). Tidak ada migrasi: kalau `JSON.parse` gagal, data lama hilang dan di-seed ulang. Kalau mengubah bentuk `LocalState` lagi, naikkan versinya.
11. **Access token TIDAK boleh dipindah ke `localStorage`.** Sekarang disimpan di variabel modul `src/lib/api/client.ts` supaya tidak terbaca XSS; ketahanan sesi datang dari cookie refresh `httpOnly`, bukan dari menyimpan token di disk.
12. **Jangan tambahkan CORS di backend.** `next.config.ts` mem-proxy `/api/*` ke `localhost:3001` lewat `rewrites`, jadi dari sisi browser semuanya same-origin dan cookie tetap first-party. Menambah CORS + `credentials: "include"` hanya akan menambah permukaan masalah tanpa manfaat.

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
npm --prefix apps/api test             # 12 unit test (RolesGuard + AuthService)
```

Performa: mode dev ~5x lebih lambat dari production. Untuk menilai kelancaran UI sesungguhnya, ukur di `npm run build && npm start`.

---

## 11. Parameter URL

**Register** (`/register`): `q`, `disc`, `stat`, `prio`, `zone`, `assignee` (comma-separated), `cf`/`ct` (rentang dibuat), `overdue=1`, `sort`, `dir`, `page`.

**Dashboard** (`/dashboard`): `range` (`30d`|`90d`|`1y`|`all`), `from`, `to`.

Drill-down dashboard → register memakai parameter yang sama (termasuk `overdue=1` dari kartu KPI Overdue), jadi keduanya tetap konsisten.

---

## 12. Rekomendasi langkah berikutnya

- **`ClashesModule` (paling utama)** — clash, komentar, audit log, lampiran. Pola integrasinya sudah terbukti di Sprint 1: tambah modul NestJS → tambah tipe di `src/lib/api/types.ts` → tambah mapper → ganti bagian `localStorage` di `data-context.tsx`. Komponen halaman tidak perlu disentuh. Setelah ini selesai, `localStorage` dan `mock-data.ts` bisa dibuang sepenuhnya.
- **Object storage untuk lampiran** — prasyarat agar lampiran bertahan setelah reload (lihat §5 "Lampiran"). Sekarang `Attachment.fileUrl` sudah ada di skema tapi belum ada yang mengisinya.
- **Sprint 5 (notifikasi email async)** — jalankan Redis dari `docker-compose.yml`, tambah BullMQ. Skema `Notification` & `NotificationPreference` sudah siap, termasuk `whatsappNumber`.
- **Refresh token rotation & blacklist** — saat ini refresh token hanya diverifikasi tanda tangannya; logout menghapus cookie tapi token yang sudah dicuri masih valid sampai kedaluwarsa. Belum kritis untuk demo, wajib sebelum produksi (Sprint 11).
- **Tes otomatis frontend** — masih nol. Kandidat kuat: `dashboard-metrics.ts` (fungsi murni) dan `allowedStatusTransitions` di `use-master-data.ts`. Backend sudah punya 12 test.
- **Verifikasi target performa PRD** (register ≤1s, dashboard ≤3s untuk 10.000 clash) — data seed baru ~87 record; `generateSeedData(count)` menerima parameter count untuk stress-test.
- **Verifikasi target performa PRD** (register ≤1s, dashboard ≤3s untuk 10.000 clash) — data mock baru ~89 record; `generateSeedData(count)` di `mock-data.ts` menerima parameter count kalau mau stress-test dengan data lebih besar.
