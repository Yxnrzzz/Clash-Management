# ClashHub — Handoff Progress

**Tanggal:** 2 Agustus 2026 (update ke-2)
**Status:** Frontend selesai (seluruh deliverable frontend dari Sprint Plan). Backend belum ada sama sekali.
**Lokasi proyek:** `D:\WebApp`

Dokumen ini untuk melanjutkan pengerjaan di sesi/chat baru. Baca ini dulu sebelum menulis kode.

---

## 1. Konteks

ClashHub adalah web platform manajemen clash & issue koordinasi BIM. Dokumen sumber ada di repo:

| Dokumen | Isi |
|---|---|
| `ClashHub_PRD.md` | Product Requirements — persona, user story, acceptance criteria, NFR |
| `ClashHub_ERD.md` | Entity Relationship Diagram (PostgreSQL) |
| `ClashHub_Sprint_Plan.md` | 12 sprint (0–11) + prompt siap-pakai per sprint |

**Update sejak handoff pertama:** seluruh sisa deliverable frontend sudah dibangun — Admin panel (User/Proyek/Master Data), bulk update + export Excel/PDF di Register, Pengaturan Notifikasi, dan wizard Import CSV. Fondasi data juga di-refactor total: master data (user, disiplin, zona, status, prioritas) sekarang **mutable** dan tersambung ke Admin panel, bukan konstanta statis lagi.

Catatan penting: ada folder `apps/api/` di root repo (NestJS scaffold) yang **bukan buatan sesi frontend ini** — sudah ada sebelum sesi ini dimulai (kemungkinan hasil sesi lain atau inisiatif user sendiri mengikuti Sprint 0 dari Sprint Plan). Proyek Next.js ini (`tsconfig.json`, `eslint.config.mjs`) sudah dikonfigurasi untuk **mengecualikan** `apps/**` dari type-check dan lint-nya sendiri, karena itu paket terpisah dengan tsconfig/lint sendiri. Jangan gabungkan kode frontend ke situ tanpa memeriksa dulu apa isinya.

---

## 2. Tech stack aktual

```
Next.js 16.2.12 (App Router, Turbopack)  ·  React 19.2.4  ·  TypeScript strict
Tailwind CSS 4  ·  TanStack Table 8  ·  Recharts 3.10  ·  Zod 4
xlsx (SheetJS)  ·  jspdf + jspdf-autotable
```

Backend yang direncanakan di Sprint Plan (**NestJS + PostgreSQL + Prisma + Redis + BullMQ**) **belum ada di `src/`** — hanya ada scaffold terpisah di `apps/api/` yang tidak tersambung ke frontend ini sama sekali (frontend masih 100% mock data).

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
    ├── types.ts                 tipe domain (Discipline/Zone/Priority kini punya isActive)
    ├── mock-data.ts              INITIAL_* (seed awal) + generateSeedData (clash dummy)
    ├── data-context.tsx          SATU-SATUNYA sumber state: clash, master data, komentar,
    │                             audit log, preferensi notifikasi + semua fungsi CRUD/mutasi
    ├── auth-context.tsx          mock auth — user diturunkan dari daftar user LIVE
    ├── use-master-data.ts        hook lookup (disciplineById dst.) terikat ke array live
    ├── use-require-auth.ts       guard route (login wajib)
    ├── use-require-admin.ts      guard route (Admin-only, redirect ke /register)
    ├── lookup.ts                 helper murni: format tanggal/bytes, canEditClash, canComment
    ├── dashboard-metrics.ts       agregasi KPI/tren/sebaran (nerima master data sbg parameter)
    ├── export.ts                  exportClashesToExcel, exportClashesToPdf
    └── csv.ts                     parser CSV minimal untuk wizard import
```

**localStorage keys:** `clashhub-auth-user-id`, `clashhub-data-v2` (naik dari v1 — skema lama tidak kompatibel, browser lama otomatis re-seed).

---

## 4. Akun demo

Password bebas, minimal 4 karakter (ini mock — tidak ada validasi password asli).

| Peran | Email |
|---|---|
| Engineer | `engineer@clashhub.dev` |
| Coordinator | `coordinator@clashhub.dev` |
| Management | `management@clashhub.dev` |
| Admin | `admin@clashhub.dev` |

User tambahan: `rizky@clashhub.dev` (Engineer), `putri@clashhub.dev` (Coordinator).

Admin bisa membuat user baru dari `/admin/users` dan user itu **langsung bisa login** (sudah diverifikasi end-to-end).

**Reset data demo:**
```js
localStorage.clear(); location.reload();
```

---

## 5. Arsitektur data — baca ini sebelum mengubah apa pun

### Master data sekarang mutable

Sebelumnya `DISCIPLINES`, `ZONES`, `STATUSES`, `PRIORITIES`, `USERS`, `PROJECT` adalah konstanta statis yang diimpor langsung dari `mock-data.ts`. **Ini sudah berubah total.** Sekarang:

- `mock-data.ts` hanya mengekspor `INITIAL_*` — nilai seed yang dipakai SEKALI saat `data-context.tsx` pertama kali membuat state (atau saat localStorage kosong).
- Setelah itu, master data hidup sebagai state di `DataProvider` (`data-context.tsx`), bisa diubah lewat CRUD functions (`createUser`, `updateDiscipline`, `toggleZoneActive`, dst.), dan dipersist ke `localStorage`.
- Untuk MEMBACA master data di komponen: pakai `useData()` (dapat array live: `disciplines`, `zones`, `statuses`, `priorities`, `users`, `project`) atau `useMasterDataLookups()` dari `use-master-data.ts` (dapat closure lookup: `disciplineById(id)`, `statusById(id)`, dst. — sudah terikat ke array live via `useMemo`).
- **Jangan pernah** import `DISCIPLINES`/`ZONES`/dst. langsung dari `mock-data.ts` di komponen manapun — itu snapshot beku saat build, bukan data yang bisa berubah oleh Admin.

### Provider order penting

`layout.tsx`: `DataProvider` membungkus `AuthProvider` (bukan sebaliknya). Ini disengaja — `auth-context.tsx` memanggil `useData()` untuk mendapat daftar user LIVE, supaya:
1. User yang baru dibuat Admin bisa langsung login.
2. Kalau Admin menonaktifkan user yang sedang login, sesinya otomatis ter-logout (`user` di-derive dari `users.find(...).isActive`, bukan disimpan sebagai object statis).

Kalau membalik urutan ini lagi, `useAuth()` akan crash karena `useData()` dipanggil di luar `DataProvider`.

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

Aturan terpusat: `src/lib/lookup.ts` (`canEditClash`, `canComment`) + `src/lib/use-master-data.ts` (`allowedStatusTransitions`) + guard `use-require-auth.ts`/`use-require-admin.ts`.

---

## 7. Status per sprint (Sprint Plan asli)

| Sprint | Fokus | Status | Catatan |
|---|---|---|---|
| 0 | Fondasi backend | ❌ Belum (frontend only) | `apps/api/` ada tapi tidak tersambung ke frontend ini |
| 1 | Auth, RBAC, Administrasi | 🟢 Frontend selesai | Halaman Admin lengkap (User/Proyek/Master Data); auth masih mock (tanpa JWT/hashing — butuh backend) |
| 2 | Input clash + lampiran | 🟢 Selesai | Lampiran kini File asli dgn preview real (bukan cuma metadata lagi) |
| 3 | Clash Register | ✅ Selesai | |
| 4 | Detail, komentar, audit, triase | ✅ Selesai | |
| 5 | Notifikasi email async | ❌ Belum (backend-only) | |
| 6 | Dashboard Manajemen | ✅ Selesai | |
| 7 | Export Excel/PDF + Bulk update | ✅ Selesai | Export client-side (SheetJS + jsPDF), bulk update dgn modal konfirmasi |
| 8 | WhatsApp + preferensi kanal | 🟢 Frontend selesai | `/settings/notifications` lengkap dgn validasi E.164; pengiriman WA asli butuh backend |
| 9 | Bulk import CSV/XML | 🟢 Frontend selesai (CSV saja) | Wizard 3 langkah penuh, tervalidasi end-to-end. XML tidak diimplementasikan (scope cut — CSV cukup mewakili pola importnya) |
| 10 | Fitur AI (opsional) | ❌ Belum | Butuh eval harness + AI asli — tidak masuk akal untuk di-fake |
| 11 | Hardening, performa, deploy | ❌ Belum | Bukan pekerjaan frontend |

**Kesimpulan: semua yang punya deliverable frontend sudah selesai.** Sisa yang belum murni backend (0, 5, 11) atau butuh keputusan produk/API asli (10).

---

## 8. Bug yang ditemukan & diperbaiki selama sesi ini

Dicatat supaya tidak terulang kalau menyentuh file yang sama:

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
7. **Next 16 hanya izinkan satu instance `next dev`** per proyek (lockfile). Jangan jalankan dua dev server.
8. **Warna chart divalidasi, bukan dikira-kira.** Kalau mengubah hex di `viz-tokens.ts`, jalankan ulang skill `dataviz` → `scripts/validate_palette.js`. Kategori nominal (disiplin, zona) pakai satu warna datar; hanya prioritas (tingkatan berurutan) yang boleh pakai ramp — dan array prioritas HARUS di-sort by `bobot` dulu sebelum dipetakan ke ramp (lihat §8.5).
9. **Testing browser di lingkungan ini kadang menembak race condition palsu.** Firing beberapa `.click()` sinkron dalam satu loop tanpa `await`/delay antar klik bisa membuat elemen DOM lama (sebelum re-render React) jadi stale reference — hasilnya klik kelihatan "gagal" padahal app-nya benar. Selalu beri jeda kecil (~50ms) antar interaksi saat menguji lewat `javascript_tool`.
10. **`localStorage` key naik dari `clashhub-data-v1` ke `clashhub-data-v2`** karena skema state berubah total (master data jadi mutable). Kalau menambah field baru ke `StoredState` lagi di masa depan, pertimbangkan menaikkan versi key lagi atau menulis migrasi eksplisit — saat ini tidak ada migrasi, data lama hilang begitu saja (`JSON.parse` gagal → fallback ke `loadInitial()`).

---

## 10. Menjalankan & verifikasi

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # cek tipe + build production
npm run lint
```

Performa: mode dev ~5x lebih lambat dari production. Untuk menilai kelancaran UI sesungguhnya, ukur di `npm run build && npm start`.

---

## 11. Parameter URL

**Register** (`/register`): `q`, `disc`, `stat`, `prio`, `zone`, `assignee` (comma-separated), `cf`/`ct` (rentang dibuat), `overdue=1`, `sort`, `dir`, `page`.

**Dashboard** (`/dashboard`): `range` (`30d`|`90d`|`1y`|`all`), `from`, `to`.

Drill-down dashboard → register memakai parameter yang sama (termasuk `overdue=1` dari kartu KPI Overdue), jadi keduanya tetap konsisten.

---

## 12. Rekomendasi langkah berikutnya

Frontend sudah lengkap secara fungsional. Pilihan realistis:

- **Mulai backend sungguhan** — monorepo pnpm, Prisma schema dari `ClashHub_ERD.md`, Docker Compose, auth JWT + argon2, lalu ganti isi `src/lib/data-context.tsx` dengan pemanggilan API (komponen halaman tidak perlu berubah, karena semuanya sudah lewat `useData()`/`useMasterDataLookups()`). **Ini juga saat yang tepat memutuskan nasib `apps/api/`** yang sudah ada — apakah dilanjutkan sebagai backend resmi atau dibuang.
- **Polish UX** — skeleton loading, empty state yang lebih kaya, animasi transisi (kalau mau, dengan `isAnimationActive` yang dikontrol hati-hati mengingat gotcha #3).
- **Tes otomatis** — belum ada unit/integration test sama sekali; kandidat kuat adalah `dashboard-metrics.ts` (fungsi murni, gampang di-test) dan `use-master-data.ts` (`allowedStatusTransitions`).
- **Verifikasi target performa PRD** (register ≤1s, dashboard ≤3s untuk 10.000 clash) — data mock baru ~89 record; `generateSeedData(count)` di `mock-data.ts` menerima parameter count kalau mau stress-test dengan data lebih besar.
