# ClashHub — Frontend (MVP)

Frontend web platform manajemen clash & issue koordinasi BIM, dibangun sesuai [ClashHub_PRD.md](./ClashHub_PRD.md).

Cakupan saat ini: **MVP inti + Dashboard Manajemen** (Sprint 0–4 dan Sprint 6 dari [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md)) — Login/RBAC, Input Clash + lampiran, Clash Register (filter/sort/search/pagination), Halaman Rincian (triase, komentar, audit trail), Clash Saya, dan Dashboard KPI dengan drill-down. Belum ada backend: seluruh data memakai **mock data lokal** yang dipersist ke `localStorage` browser, sehingga aksi (buat clash, ubah status, komentar) terasa nyata tanpa server.

> Sprint 5 (notifikasi email async) dilewati sementara karena 100% backend — NestJS + BullMQ + Redis worker, tanpa deliverable frontend.

## Tech stack

Next.js (App Router) + React + TypeScript, Tailwind CSS, TanStack Table, Recharts, Zod — sesuai rekomendasi final di PRD Bagian 4.2 / Sprint Plan.

## Menjalankan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Akun demo

Login dengan salah satu email berikut (password bebas, minimal 4 karakter):

| Peran | Email |
|---|---|
| Engineer | engineer@clashhub.dev |
| Coordinator | coordinator@clashhub.dev |
| Management | management@clashhub.dev |
| Admin | admin@clashhub.dev |

## Struktur

- `src/lib/mock-data.ts` — data referensi (project, user, disiplin, zona, status, prioritas) + generator ~87 clash contoh.
- `src/lib/data-context.tsx` — state clash/komentar/audit log di client, dipersist ke `localStorage` (`clashhub-data-v1`).
- `src/lib/auth-context.tsx` — mock auth berbasis daftar user (`clashhub-auth-user-id`).
- `src/lib/lookup.ts` — helper format & aturan RBAC (transisi status, hak edit, hak komentar).
- `src/app/login`, `/register`, `/clashes/new`, `/clashes/[id]`, `/my-clashes`, `/dashboard` — halaman utama.
- `src/lib/dashboard-metrics.ts` — agregasi KPI, tren mingguan, dan sebaran per disiplin/prioritas/zona.
- `src/components/dashboard/viz-tokens.ts` — warna chart hasil validasi (lihat catatan di bawah).

## Catatan chart

Warna chart divalidasi terhadap surface kartu aplikasi (`#ffffff`), bukan sekadar dipilih dengan mata:

- Palet kategorikal (tren dibuat vs ditutup) — lolos semua check, CVD ΔE 24.7.
- Ramp ordinal prioritas Low→Critical — lolos semua check, lightness monoton.

Disiplin dan zona adalah kategori **nominal**, jadi keduanya memakai satu warna datar; memberi ramp nilai di sana justru meng-encode ganda panjang batang. Prioritas adalah tingkatan **berurutan**, sehingga ramp satu-hue sah dipakai. Setiap chart punya kembaran tabel (toggle "Tampilkan tabel data") agar tidak ada nilai yang hanya bisa dibaca lewat warna atau tooltip.

## RBAC yang diterapkan

- **Management**: baca-saja di seluruh Register & Detail; tidak bisa membuat clash atau komentar.
- **Engineer**: bisa input clash baru; di item yang di-assign ke dirinya hanya bisa transisi status maju satu langkah (Open → In Progress → Resolved, tidak bisa menutup atau mundur).
- **Coordinator / Admin**: kelola penuh — assign, ubah prioritas/due date, semua transisi status.

## Reset data demo

Untuk mengembalikan ke data seed awal, hapus localStorage lewat DevTools console:

```js
localStorage.clear();
location.reload();
```

## Lanjutan

Sprint berikutnya (Dashboard KPI, Export Excel/PDF, Bulk Update, Admin panel, notifikasi, backend NestJS + PostgreSQL) mengikuti [ClashHub_Sprint_Plan.md](./ClashHub_Sprint_Plan.md).
