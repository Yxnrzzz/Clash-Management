# ClashHub API — Sprint 1 (Auth, RBAC & Administrasi) + ClashesModule

Backend NestJS untuk ClashHub. PostgreSQL & Redis dijalankan via Docker Compose, skema dikelola oleh Prisma ORM.

## Stack

- NestJS (Node.js + TypeScript)
- PostgreSQL 16 (Docker)
- Redis 7 (Docker, placeholder untuk caching/queue — belum dipakai)
- Prisma ORM
- JWT (`@nestjs/jwt` + passport-jwt) & argon2 (`@node-rs/argon2`)
- class-validator & class-transformer

## Menjalankan

1. Install dependencies:

   ```bash
   npm install
   ```

2. Jalankan PostgreSQL & Redis:

   ```bash
   docker compose up -d
   ```

3. Jalankan migrasi database:

   ```bash
   npx prisma migrate dev
   ```

4. Isi data awal (seed):

   ```bash
   npx prisma db seed
   ```

5. Jalankan server dalam mode development:

   ```bash
   npm run start:dev
   ```

Server berjalan di `http://localhost:3001` dengan prefix `/api` (port dikonfigurasi lewat `PORT` di `.env`). Frontend Next.js di port 3000 mem-proxy `/api/*` ke sini lewat `rewrites` di `next.config.ts`, jadi dari sisi browser API tampak same-origin — **tidak ada konfigurasi CORS, dan memang tidak diperlukan**.

## Test

```bash
npm test
```

Mencakup `RolesGuard` (izin/tolak per peran), `AuthService` (login benar/salah/akun nonaktif, isi payload token), dan `ClashesService` (RBAC per-field, transisi status, `closedAt`, audit log, format `uniqueCode`) — 26 test total.

## Environment

Salin `.env.example` menjadi `.env` dan sesuaikan bila perlu:

```
PORT=3001
DATABASE_URL="postgresql://clashuser:clashpass@localhost:5432/clashhub_db?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET="dev-access-secret-ganti-di-produksi"
JWT_REFRESH_SECRET="dev-refresh-secret-ganti-di-produksi"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
```

## Autentikasi

- `POST /api/auth/login` mengembalikan **access token** (JWT, 15 menit) di body, dan menaruh **refresh token** (7 hari) di cookie `httpOnly` bernama `clashhub_refresh` dengan path `/api/auth`.
- Access token dikirim di header `Authorization: Bearer <token>`. Frontend menyimpannya di memori (bukan `localStorage`) supaya tidak terbaca XSS.
- `POST /api/auth/refresh` menukar cookie refresh dengan access token baru. User dibaca ulang dari database setiap kali, sehingga akun yang dinonaktifkan di tengah sesi tidak bisa memperpanjang sesinya.
- Seluruh route wajib token kecuali yang ditandai `@Public()`: `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`.

## Daftar endpoint

| Method | Endpoint | Peran yang diizinkan |
|---|---|---|
| GET | `/api/health` | publik |
| POST | `/api/auth/login` | publik |
| POST | `/api/auth/refresh` | publik (butuh cookie refresh) |
| POST | `/api/auth/logout` | publik |
| GET | `/api/auth/me` | semua yang login |
| GET | `/api/users` | semua yang login (Register butuh daftar assignee) |
| POST | `/api/users` | Admin |
| PATCH | `/api/users/:id` | Admin |
| PATCH | `/api/users/:id/active` | Admin |
| GET | `/api/projects/current` | semua yang login |
| PATCH | `/api/projects/:id` | Admin |
| GET | `/api/master-data/disciplines` \| `zones` \| `statuses` \| `priorities` | semua yang login |
| POST | `/api/master-data/disciplines` \| `zones` \| `priorities` | Admin |
| PATCH | `/api/master-data/disciplines/:id` \| `zones/:id` \| `priorities/:id` \| `statuses/:id` | Admin |
| PATCH | `/api/master-data/{disciplines,zones,priorities}/:id/active` | Admin |
| GET | `/api/clashes` | semua yang login (seluruh clash proyek aktif, tanpa pagination server-side) |
| GET | `/api/clashes/:id` | semua yang login (clash + komentar + audit log) |
| POST | `/api/clashes` | Engineer, Coordinator, Admin |
| PATCH | `/api/clashes/:id` | Engineer (item sendiri, status maju 1 langkah saja, tidak boleh menutup), Coordinator/Admin (penuh) |
| POST | `/api/clashes/bulk` | Coordinator, Admin |
| POST | `/api/clashes/:id/comments` | Engineer, Coordinator, Admin |

`PATCH /api/clashes/:id` menerima subset `{ statusId, priorityId, assigneeId, dueDate }`. Aturan siapa boleh mengubah field mana ditegakkan di `ClashesService` (`assertCanEdit`, `buildAllowedPatch`), bukan cuma `@Roles()` — lihat `src/clashes/clashes.service.ts`. Setiap field yang benar-benar berubah menulis satu baris `AuditLog`, dengan `oldValue`/`newValue` sudah diterjemahkan ke nama (bukan id mentah). `uniqueCode` pada `POST /api/clashes` dibuat server-side dalam transaksi, format `{kode-proyek}-{kode-disiplin}-{urutan 4 digit}`.

Status **tidak** bisa ditambah atau dihapus — hanya label dan `isClosedState` yang bisa diubah. Alasannya `allowedStatusTransitions()` di frontend bergantung pada rantai empat tahap yang tetap (`sequence`). Server juga menolak permintaan yang membuat tidak ada satu pun status penutup tersisa.

Disiplin, zona, dan prioritas memakai **soft-delete** lewat `isActive`, bukan hapus permanen, supaya clash lama yang mereferensikan id tersebut tidak menjadi orphan.

## Akun demo (hasil seed)

Password untuk semua akun: **`demo1234`** (di-hash dengan argon2id).

| Peran | Email |
|---|---|
| Engineer | `engineer@clashhub.dev` |
| Coordinator | `coordinator@clashhub.dev` |
| Management | `management@clashhub.dev` |
| Admin | `admin@clashhub.dev` |

Tambahan: `rizky@clashhub.dev` (Engineer), `putri@clashhub.dev` (Coordinator).

## Catatan seed

`prisma/seed.ts` sengaja memakai **id eksplisit yang mudah dibaca** untuk master data dan user (`proj-1`, `u-eng`, `disc-ars`, `st-open`, `pr-low`, `zone-1`, …), bukan uuid acak — mempermudah membaca data lewat Prisma Studio/psql dan menjaga seed idempoten. **Id-id ini bukan format uuid**, jadi DTO manapun yang mereferensikannya (mis. `disciplineId` di `CreateClashDto`) harus divalidasi sebagai string biasa, bukan `@IsUUID()`.

Seeding master data & user bersifat idempoten (memakai `upsert`), jadi aman dijalankan ulang. `passwordHash` sengaja tidak ikut di-update agar password yang sudah diganti admin tidak ter-reset.

Seeding **clash** (87 baris deterministik, RNG mulberry32 seed 42, fungsi `seedClashes()`) hanya jalan kalau tabel `Clash` masih kosong — dicek lewat `prisma.clash.count()`. Ini beda dari master data: clash **tidak** di-`upsert` ulang setiap kali seed dijalankan, supaya data yang sudah dibuat lewat aplikasi (bukan seed) tidak tertimpa. Untuk reset penuh, kosongkan tabel `Clash`/`Comment`/`AuditLog` secara manual lalu jalankan `npx prisma db seed` lagi.
