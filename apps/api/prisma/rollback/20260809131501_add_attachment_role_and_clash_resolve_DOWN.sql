-- ============================================================================
-- ROLLBACK LAPIS 3 untuk migrasi
--   20260809131501_add_attachment_role_and_clash_resolve
--
-- SENGAJA DILETAKKAN DI LUAR prisma/migrations/ supaya `prisma migrate deploy`
-- tidak pernah mengambilnya. File ini tidak dijalankan otomatis oleh apa pun.
--
-- JANGAN JALANKAN KECUALI DIMINTA EKSPLISIT. Skrip ini MENGHAPUS DATA:
--   - seluruh teks "Resolve (TATA Proposed)" dan "Resolve by Consultant"
--     yang sudah diketik pengguna
--   - seluruh penandaan peran lampiran (ORIGINAL / CLASH_DETECTION)
--
-- HAMPIR SELALU TIDAK PERLU. Ketiga kolom yang ditambahkan bersifat aditif
-- murni: `Attachment.role` NOT NULL dengan DEFAULT, dua kolom Clash nullable.
-- Prisma Client meng-generate daftar kolom SELECT/INSERT secara eksplisit dari
-- schema saat ia di-generate, jadi client versi lama tidak pernah menyebut
-- kolom-kolom ini — INSERT-nya tetap valid karena DEFAULT dan NULL. Artinya
-- kode lama berjalan normal di atas skema baru, sehingga ROLLBACK LAPIS 2
-- (kembalikan kode ke tag `pre-clash-report`, biarkan kolomnya) sudah cukup
-- dan tidak menghilangkan data apa pun.
--
-- Pakai skrip ini hanya kalau kolomnya benar-benar harus lenyap dari skema.
--
-- ----------------------------------------------------------------------------
-- SEBELUM MENJALANKAN:
--   "C:/Program Files/PostgreSQL/16/bin/pg_dump.exe" -U clashuser -h localhost \
--     -F c -f backups/before-rollback.dump clashhub_db
--
-- MENJALANKAN:
--   "C:/Program Files/PostgreSQL/16/bin/psql.exe" -U clashuser -h localhost \
--     -d clashhub_db -v ON_ERROR_STOP=1 \
--     -f apps/api/prisma/rollback/20260809131501_add_attachment_role_and_clash_resolve_DOWN.sql
--
-- SESUDAH MENJALANKAN:
--   cd apps/api && npm run check:clash-seq
--   (dan pastikan kode yang berjalan sudah versi pre-clash-report, karena
--    Prisma Client yang baru akan error kalau kolomnya sudah tidak ada)
-- ============================================================================

BEGIN;

ALTER TABLE "Clash" DROP COLUMN IF EXISTS "resolveProposed";
ALTER TABLE "Clash" DROP COLUMN IF EXISTS "resolveByConsultant";
ALTER TABLE "Attachment" DROP COLUMN IF EXISTS "role";

DROP TYPE IF EXISTS "AttachmentRole";

-- Tanpa baris ini `prisma migrate status` akan melaporkan migrasi tersebut
-- masih diterapkan, dan `migrate deploy` berikutnya melewatinya — sehingga
-- kolomnya tidak pernah kembali kalau nanti di-roll-forward lagi.
DELETE FROM _prisma_migrations
WHERE migration_name = '20260809131501_add_attachment_role_and_clash_resolve';

COMMIT;

-- CATATAN: Project_archivedAt_idx sengaja TIDAK disentuh di sini. Index itu
-- sudah ada sebelum migrasi ini (dibuat di 20260808120000) dan hanya
-- dideklarasikan ulang di schema.prisma untuk menutup drift; migrasi ini tidak
-- membuat maupun menghapusnya, jadi rollback-nya juga tidak boleh.
