# ClashHub — Handoff Progress

**Tanggal:** 2 Agustus 2026
**Status:** Frontend-only, tanpa backend. Sprint 0–4 (sebagian) + Sprint 6 selesai.
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

**Yang sudah dibangun baru lapisan frontend.** Seluruh data memakai mock lokal yang dipersist ke `localStorage`, jadi aksi user (buat clash, ubah status, komentar) terasa nyata tanpa server.

---

## 2. Tech stack aktual

```
Next.js 16.2.12 (App Router, Turbopack)  ·  React 19.2.4  ·  TypeScript strict
Tailwind CSS 4  ·  TanStack Table 8  ·  Recharts 3.10  ·  Zod 4
```

Backend yang direncanakan di Sprint Plan (**NestJS + PostgreSQL + Prisma + Redis + BullMQ**) **belum ada sama sekali**.

---

## 3. Struktur file

```
src/
├── app/
│   ├── layout.tsx              AuthProvider → DataProvider → AppShell
│   ├── page.tsx                redirect / → /register atau /login
│   ├── login/page.tsx
│   ├── register/page.tsx       Suspense wrapper → RegisterView
│   ├── dashboard/page.tsx      → DashboardView
│   ├── my-clashes/page.tsx
│   └── clashes/
│       ├── new/page.tsx        form input + drag-drop lampiran
│       └── [id]/page.tsx       detail, triase, komentar, audit trail
├── components/
│   ├── AppShell.tsx            sidebar + nav (nav difilter per peran)
│   ├── Badge.tsx               StatusBadge, PriorityBadge, OverdueBadge
│   ├── register/
│   │   ├── RegisterView.tsx    tabel + filter + sort + pagination
│   │   └── FilterChips.tsx     chip group (memoized)
│   └── dashboard/
│       ├── DashboardView.tsx   KPI + 4 chart + drill-down
│       ├── ChartPieces.tsx     StatTile, ChartCard, VizTooltip, LegendKey
│       └── viz-tokens.ts       warna chart hasil validasi
└── lib/
    ├── types.ts                seluruh tipe domain
    ├── mock-data.ts            master data + generator ~87 clash
    ├── auth-context.tsx        mock auth
    ├── data-context.tsx        state clash/komentar/audit + persist
    ├── lookup.ts               helper format + aturan RBAC
    ├── use-require-auth.ts     guard route
    └── dashboard-metrics.ts    agregasi KPI/tren/sebaran
```

**localStorage keys:** `clashhub-auth-user-id`, `clashhub-data-v1`

---

## 4. Akun demo

Password bebas, minimal 4 karakter.

| Peran | Email |
|---|---|
| Engineer | `engineer@clashhub.dev` |
| Coordinator | `coordinator@clashhub.dev` |
| Management | `management@clashhub.dev` |
| Admin | `admin@clashhub.dev` |

User tambahan (target assignee): `rizky@clashhub.dev` (Engineer), `putri@clashhub.dev` (Coordinator).

**Master data:** Project `MCA — Menara Cendana — Tower A` · Disiplin ARS/STR/MEP/OTH · 6 zona · Status Open→In Progress→Resolved→Closed (`Closed` = `isClosedState`) · Prioritas Low/Medium/High/Critical.

**Reset data demo:** jalankan di console browser →
```js
localStorage.clear(); location.reload();
```

---

## 5. RBAC yang sudah ditegakkan

| Peran | Register | Buat clash | Edit item | Komentar | Dashboard |
|---|---|---|---|---|---|
| **Engineer** | ✅ | ✅ | Hanya item miliknya, status **maju satu langkah** (Open→In Progress→Resolved, tidak bisa menutup/mundur) | ✅ | ❌ |
| **Coordinator** | ✅ | ✅ | Penuh (assign, prioritas, due date, semua transisi) | ✅ | ✅ |
| **Management** | ✅ baca-saja | ❌ | ❌ | ❌ | ✅ |
| **Admin** | ✅ | ✅ | Penuh | ✅ | ✅ |

Aturannya terpusat di `src/lib/lookup.ts` → `canEditClash()`, `allowedStatusTransitions()`, `canComment()`.

---

## 6. Status per sprint

| Sprint | Fokus | Status | Catatan |
|---|---|---|---|
| 0 | Fondasi | 🟡 Sebagian | Scaffold Next.js saja. **Tidak ada** monorepo pnpm, Prisma schema, migrasi, seed DB, Docker Compose, CI |
| 1 | Auth, RBAC, Administrasi | 🟡 Sebagian | RBAC ditegakkan di UI. **Tidak ada** JWT/argon2, dan **halaman admin belum dibuat** (`/admin/users`, `/admin/projects`, `/admin/master-data`) |
| 2 | Input clash + lampiran | 🟡 Sebagian | Form + validasi Zod + drag-drop UI selesai. **Lampiran hanya metadata** (nama/ukuran/tipe) — file tidak diunggah, tidak ada object storage/signed URL/preview |
| 3 | Clash Register | ✅ Selesai | Filter multi-dimensi, search, sort, pagination, state di URL |
| 4 | Detail, komentar, audit, triase | ✅ Selesai | Audit trail per perubahan field, transisi status tervalidasi, `closedAt` otomatis |
| 5 | Notifikasi email async | ❌ Belum | 100% backend (BullMQ + Redis + SMTP) — dilewati karena tanpa deliverable frontend |
| 6 | Dashboard Manajemen | ✅ Selesai | KPI, tren mingguan, sebaran, drill-down, table view |
| 7 | Export Excel/PDF + Bulk update | ❌ Belum | **Kandidat berikutnya** — punya sisi frontend jelas |
| 8 | WhatsApp + preferensi kanal | ❌ Belum | Butuh backend; frontend `/settings/notifications` bisa dibuat duluan |
| 9 | Bulk import CSV/XML | ❌ Belum | Wizard 3 langkah bisa dibuat frontend-first |
| 10 | Fitur AI (opsional) | ❌ Belum | Wajib disertai eval harness + human-in-the-loop |
| 11 | Hardening, performa, deploy | ❌ Belum | |

---

## 7. Yang BELUM ada (ringkas & eksplisit)

- **Backend sepenuhnya** — tidak ada NestJS, PostgreSQL, Prisma, Redis, BullMQ, REST API.
- **Autentikasi asli** — login menerima password apa pun ≥4 karakter. Tidak ada hashing, JWT, refresh token, atau proteksi server-side.
- **Halaman Admin** — CRUD user, project, member, dan master data (deliverable frontend Sprint 1) belum dibuat.
- **Upload lampiran sungguhan** — tidak ada object storage, signed URL, preview gambar, atau unduh PDF.
- **Notifikasi** — email maupun WhatsApp.
- **Export Excel/PDF** dan **bulk update**.
- **Tes** — belum ada unit/integration test sama sekali.
- **Verifikasi target performa PRD** (register ≤1s, dashboard ≤3s, export ≤10s untuk 10.000 clash) — data mock baru ~89 record, jadi target NFR **belum teruji**.

---

## 8. Gotcha penting (baca sebelum menulis kode)

1. **`AGENTS.md` mewajibkan** membaca `node_modules/next/dist/docs/` sebelum menulis kode. Next.js 16 punya breaking change dari versi yang mungkin ada di data latihmu.
2. **`params` & `searchParams` adalah Promise** di Next 16. Di Client Component pakai `use(params)` — lihat `src/app/clashes/[id]/page.tsx`.
3. **Jangan pakai `router.replace()` untuk update URL di jalur interaksi cepat** (filter, search). Itu memicu request RSC ke server tiap klik dan bikin lemot. Pola yang dipakai sekarang: state filter murni di React + `window.history.replaceState` yang di-**debounce 350ms**. Lihat `RegisterView.tsx`.
4. **Recharts wajib `isAnimationActive={false}`.** Animasi masuknya bergantung pada `requestAnimationFrame`; kalau rAF tidak berjalan, batang chart tidak pernah tergambar (grup ada tapi `<g>` kosong).
5. **ESLint `react-hooks/set-state-in-effect`** akan error pada hidrasi dari `localStorage`. Sudah diberi `eslint-disable-next-line` beserta alasannya — jangan dihapus.
6. **Warning lint yang sudah diketahui & aman:** `react-hooks/incompatible-library` pada `useReactTable` di `RegisterView.tsx`. TanStack Table memang stack wajib di PRD, jadi dibiarkan.
7. **Next 16 hanya mengizinkan satu instance `next dev` per proyek** (mekanisme lockfile). Jangan jalankan dua dev server.
8. **Warna chart divalidasi, bukan dikira-kira.** Kalau mengubah hex di `viz-tokens.ts`, jalankan ulang validator dari skill `dataviz`. Kategori nominal (disiplin, zona) memakai satu warna datar; hanya prioritas (tingkatan berurutan) yang boleh pakai ramp.

---

## 9. Menjalankan

```bash
npm install
npm run dev
```

Buka http://localhost:3000 . Perintah lain: `npm run build`, `npm start`, `npm run lint`.

Catatan performa: mode dev ~5x lebih lambat dari production (12–23ms vs 2.4–4ms per klik filter, terukur). Kalau menilai kelancaran UI, ukur di `npm run build && npm start`.

---

## 10. Parameter URL

**Register** (`/register`): `q`, `disc`, `stat`, `prio`, `zone`, `assignee` (semua comma-separated), `cf`/`ct` (rentang dibuat), `overdue=1`, `sort`, `dir`, `page`.

**Dashboard** (`/dashboard`): `range` (`30d`|`90d`|`1y`|`all`), `from`, `to`.

Drill-down dashboard → register memakai parameter yang sama, jadi keduanya tetap konsisten.

---

## 11. Rekomendasi langkah berikutnya

Pilih salah satu:

- **Sprint 7 (Export + Bulk update)** — lanjutan frontend paling wajar. Bulk update bisa sepenuhnya jalan dengan mock data; export Excel bisa dikerjakan client-side dengan SheetJS/ExcelJS tanpa backend.
- **Melengkapi Sprint 1–2 yang tertinggal** — halaman Admin (user/project/master data) dan upload lampiran sungguhan. Ini menutup lubang MVP sebelum menambah fitur baru.
- **Mulai backend (Sprint 0–1 versi asli)** — monorepo pnpm, Prisma schema dari `ClashHub_ERD.md`, Docker Compose, auth JWT. Setelah itu frontend tinggal disambungkan menggantikan `data-context.tsx`.

Kalau memilih backend, perhatikan bahwa `src/lib/data-context.tsx` adalah satu-satunya titik sentuh data — mengganti isinya dengan pemanggilan API tidak akan mengubah komponen halaman.
