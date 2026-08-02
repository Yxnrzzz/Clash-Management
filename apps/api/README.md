# ClashHub API — Backend Foundation (Sprint 0)

Backend NestJS untuk ClashHub. PostgreSQL & Redis dijalankan via Docker Compose, skema dikelola oleh Prisma ORM.

## Stack

- NestJS (Node.js + TypeScript)
- PostgreSQL 16 (Docker)
- Redis 7 (Docker, placeholder untuk caching/queue)
- Prisma ORM
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
   npx prisma migrate dev --name init
   ```

4. Isi data awal (seed):

   ```bash
   npx prisma db seed
   ```

5. Jalankan server dalam mode development:

   ```bash
   npm run start:dev
   ```

Server berjalan di `http://localhost:3000` (port dikonfigurasi lewat `PORT` di `.env`).

## Environment

Salin `.env.example` menjadi `.env` dan sesuaikan bila perlu:

```
PORT=3000
DATABASE_URL="postgresql://clashuser:clashpass@localhost:5432/clashhub_db?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Health Check

```
GET /health
```

Response (200):

```json
{
  "status": "ok",
  "timestamp": "2026-08-02T00:00:00.000Z",
  "uptime": 12.34,
  "database": "connected"
}
```

## Akun demo (hasil seed)

| Peran | Email | Password |
|---|---|---|
| Admin | admin@clashhub.com | password |
| Coordinator | coord@clashhub.com | password |
| Engineer | eng@clashhub.com | password |
| Management | mgmt@clashhub.com | password |

Password disimpan plain text di kolom `passwordHash` untuk kebutuhan development sprint ini — hashing & autentikasi asli belum termasuk lingkup Sprint 0.
