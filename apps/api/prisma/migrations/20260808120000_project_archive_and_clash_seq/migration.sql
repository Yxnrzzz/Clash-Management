-- 1. Project archive (soft archive, distinct from hard delete)
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");

-- 2. Clash.seq: the per-discipline sequence number, previously only ever
--    embedded inside the uniqueCode string. Nullable during backfill.
ALTER TABLE "Clash" ADD COLUMN "seq" INTEGER;

-- 3. Backfill seq per discipline. Order by the trailing number parsed out of
--    the existing uniqueCode where possible (so well-formed codes keep their
--    number), falling back to createdAt/id ordering for anything unparseable
--    (e.g. load-test rows like "LOADTEST-000000"), which sort last and get
--    numbers above the real ones instead of colliding with them.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "disciplineId"
           ORDER BY COALESCE(
                      NULLIF(substring("uniqueCode" from '(\d+)$'), '')::bigint,
                      9223372036854775807),
                    "createdAt", id
         ) AS rn
    FROM "Clash"
)
UPDATE "Clash" c SET "seq" = n.rn FROM numbered n WHERE c.id = n.id;

ALTER TABLE "Clash" ALTER COLUMN "seq" SET NOT NULL;

-- 4. Swap the global unique constraint on uniqueCode for a partial unique
--    index scoped to live (non-deleted) rows, so a soft-deleted clash's code
--    can be reused by a new clash in the same discipline. Also enforce
--    uniqueness of (disciplineId, seq) among live rows, which is what the
--    gap-filling allocator relies on.
DROP INDEX "Clash_uniqueCode_key";
CREATE UNIQUE INDEX "Clash_uniqueCode_live_key"
  ON "Clash"("uniqueCode") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Clash_disciplineId_seq_live_key"
  ON "Clash"("disciplineId", "seq") WHERE "deletedAt" IS NULL;

-- 5. Replaces the dropped unique index for ORDER BY uniqueCode (buildListOrderBy)
--    and the `contains` search on uniqueCode.
CREATE INDEX "Clash_uniqueCode_idx" ON "Clash"("uniqueCode");
