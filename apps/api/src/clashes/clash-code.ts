import { Prisma } from '@prisma/client';

/**
 * Sibling of clash-scope.ts, same rationale: kept out of ClashesService so
 * ProjectsService and MasterDataService (the code-rename callers) can import
 * it without a circular dependency on ClashesModule.
 *
 * uniqueCode is a PURE function of (project.code, discipline.code, seq) —
 * see the schema.prisma comment on Clash. Never parse it back apart; discipline
 * codes have no charset validation and can legally contain "-".
 */

/** Namespace half of the two-argument pg_advisory_xact_lock(int4, int4) key
 * used to serialize clash-code allocation per discipline. A hash collision
 * between two disciplines just means extra (harmless) serialization. */
export const CLASH_SEQ_LOCK_NAMESPACE = 9021;

export const CLASH_SEQ_PAD = 4;

/** AuditLog rows written per code rename (ProjectsService.update,
 * MasterDataService.updateDiscipline) are chunked at this size to stay
 * well under Postgres's per-statement parameter limit on large projects. */
export const CODE_RENAME_AUDIT_CHUNK_SIZE = 5000;

export function formatClashCode(projectCode: string, disciplineCode: string, seq: number): string {
  return `${projectCode}-${disciplineCode}-${String(seq).padStart(CLASH_SEQ_PAD, '0')}`;
}

/** Prisma's interactive-transaction client — the subset these helpers need. */
type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

/**
 * Takes an xact-scoped advisory lock for this discipline's code sequence.
 * Must run on the same `tx` as the allocation that follows it — the lock is
 * only meaningful because Prisma's interactive transaction pins one
 * dedicated connection. Auto-released on commit OR rollback.
 */
export async function lockDiscipline(tx: Tx, disciplineId: string): Promise<void> {
  // pg_advisory_xact_lock(int4, int4) requires BOTH args as 32-bit int —
  // Prisma's tagged template sends a plain JS number literal as bigint by
  // default, which doesn't match any pg_advisory_xact_lock overload
  // (there's no (bigint, integer) variant) and fails with error 42883.
  // Cast explicitly rather than relying on Prisma's inference.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLASH_SEQ_LOCK_NAMESPACE}::int4, hashtext(${disciplineId}))`;
}

/**
 * Lowest sequence number not held by a live (non-deleted) clash in this
 * discipline — the gap-filling allocator behind createClashRecord(). Caller
 * must hold lockDiscipline() first to avoid two concurrent creates both
 * picking the same gap.
 *
 * Cheap path first: if the live-row count equals the current max seq, there
 * is no gap and the answer is max+1 (two index-only aggregates). Only when
 * count < max does it fall back to the generate_series scan, which is O(n)
 * over the discipline's live rows — fine at the scale this app runs at
 * (thousands per discipline); see clashes.service.ts createClashRecord for
 * the documented escape hatch if that ever stops being true.
 */
export async function allocateLowestFreeSeq(tx: Tx, disciplineId: string): Promise<number> {
  const [{ count, max }] = await tx.$queryRaw<{ count: bigint; max: number | null }[]>`
    SELECT count(*)::bigint AS count, COALESCE(max("seq"), 0)::int AS max
      FROM "Clash"
     WHERE "disciplineId" = ${disciplineId} AND "deletedAt" IS NULL`;

  if (Number(count) >= (max ?? 0)) {
    return (max ?? 0) + 1;
  }

  const rows = await tx.$queryRaw<{ seq: number }[]>`
    SELECT COALESCE(MIN(s.n), 1)::int AS seq
      FROM generate_series(1, ${max ?? 0} + 1) AS s(n)
     WHERE NOT EXISTS (
       SELECT 1 FROM "Clash" c
        WHERE c."disciplineId" = ${disciplineId}
          AND c."deletedAt" IS NULL
          AND c."seq" = s.n)`;
  return rows[0]?.seq ?? 1;
}

/** End of the sequence — used by restore(), which must NOT fill a gap (that
 * would churn a second live clash's would-be next code). */
export async function allocateNextSeq(tx: Tx, disciplineId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    SELECT (COALESCE(MAX("seq"), 0) + 1)::int AS seq FROM "Clash"
     WHERE "disciplineId" = ${disciplineId} AND "deletedAt" IS NULL`;
  return rows[0]?.seq ?? 1;
}
