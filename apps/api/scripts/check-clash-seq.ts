/**
 * Read-only invariant check: uniqueCode must always equal
 * formatClashCode(project.code, discipline.code, seq). Run before and after
 * the project_archive_and_clash_seq migration, and after any bulk data
 * fix, to catch drift early instead of via a confused user report.
 *
 * Usage: npx ts-node scripts/check-clash-seq.ts
 */
import { PrismaClient } from '@prisma/client';
import { formatClashCode } from '../src/clashes/clash-code';

const prisma = new PrismaClient();

async function main() {
  const clashes = await prisma.clash.findMany({
    select: {
      id: true,
      uniqueCode: true,
      seq: true,
      project: { select: { code: true } },
      discipline: { select: { code: true } },
    },
  });

  const mismatches = clashes.filter(
    (c) => c.uniqueCode !== formatClashCode(c.project.code, c.discipline.code, c.seq),
  );

  if (mismatches.length === 0) {
    console.log(`OK — ${clashes.length} clash checked, no drift.`);
    return;
  }

  console.error(`DRIFT — ${mismatches.length}/${clashes.length} clash have a stale uniqueCode:`);
  for (const c of mismatches.slice(0, 50)) {
    const expected = formatClashCode(c.project.code, c.discipline.code, c.seq);
    console.error(`  ${c.id}: stored="${c.uniqueCode}" expected="${expected}"`);
  }
  if (mismatches.length > 50) {
    console.error(`  ...and ${mismatches.length - 50} more.`);
  }
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
