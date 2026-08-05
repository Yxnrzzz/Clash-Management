import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Sprint 11 load-test data generator — NOT part of the demo seed
 * (prisma/seed.ts) and not run automatically by `prisma db seed`.
 *
 * ClashHub's ClashesService.currentProject() always resolves to the
 * earliest-created Project row (single-project design, see HANDOFF.md §5)
 * — there is no way to point GET /clashes at a separate "load test" project,
 * so a genuinely isolated project would never be reachable through the
 * routes k6 needs to hit. Instead, this seeds directly into the real demo
 * project (proj-1) but tags every row with `externalId: 'loadtest-<n>'`,
 * making the whole batch trivially identifiable and fully reversible with
 * one scoped delete — see cleanup() below, or run with --cleanup.
 *
 * Usage:
 *   npx ts-node prisma/seed-load-test.ts [--count=10000] [--cleanup]
 */

const prisma = new PrismaClient();

const EXTERNAL_ID_PREFIX = 'loadtest-';
const BATCH_SIZE = 2000;

const CLASH_TITLES = [
  'Bentrok pipa HVAC dengan balok struktur',
  'Konflik jalur kabel listrik dengan plafon arsitektur',
  'Kolom struktur menembus ruang tangga',
  'Pipa air bersih bertabrakan dengan sparing STR',
  'Ducting AC memotong balok anak',
  'Instalasi sprinkler bentrok dengan jalur kabel tray',
  'Dinding partisi menghalangi akses shaft MEP',
  'Elevasi plafon tidak sesuai dengan ducting utama',
  'Bukaan pintu terhalang kolom praktis',
  'Jalur pipa drainase bentrok dengan pondasi',
];
const CLASH_DESCRIPTION =
  'Baris uji beban Sprint 11 (k6) — dibuat oleh prisma/seed-load-test.ts, aman dihapus lewat externalId prefix "loadtest-".';

function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function cleanup(): Promise<number> {
  const { count } = await prisma.clash.deleteMany({
    where: { externalId: { startsWith: EXTERNAL_ID_PREFIX } },
  });
  console.log(`Dihapus ${count} baris load-test (externalId LIKE '${EXTERNAL_ID_PREFIX}%').`);
  return count;
}

async function main() {
  const args = process.argv.slice(2);
  const cleanupOnly = args.includes('--cleanup');
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? Number(countArg.split('=')[1]) : 10_000;

  await cleanup();
  if (cleanupOnly) {
    await prisma.$disconnect();
    return;
  }

  const project = await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!project) throw new Error('Belum ada proyek — jalankan `npm run prisma:seed` dulu.');

  const [statuses, priorities, disciplines, zones, members] = await Promise.all([
    prisma.status.findMany(),
    prisma.priority.findMany(),
    prisma.discipline.findMany({ where: { projectId: project.id, isActive: true } }),
    prisma.zone.findMany({ where: { projectId: project.id, isActive: true } }),
    prisma.projectMember.findMany({ where: { projectId: project.id } }),
  ]);
  if (!statuses.length || !priorities.length || !disciplines.length || !zones.length || !members.length) {
    throw new Error('Master data proyek kosong — jalankan `npm run prisma:seed` dulu.');
  }
  const userIds = members.map((m) => m.userId);

  const rng = mulberry32(1337);
  const now = new Date();

  console.log(`Membuat ${count} clash uji beban di proyek ${project.code}...`);

  for (let start = 0; start < count; start += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - start);
    const rows: Prisma.ClashCreateManyInput[] = [];

    for (let i = 0; i < batchCount; i++) {
      const n = start + i;
      const discipline = pick(rng, disciplines);
      const zone = pick(rng, zones);
      const priority = pick(rng, priorities);
      const status = pick(rng, statuses);
      const reporterId = pick(rng, userIds);
      const assigneeId = rng() < 0.9 ? pick(rng, userIds) : null;
      const createdAt = addDays(now, -Math.floor(rng() * 180));
      const dueDate = rng() < 0.85 ? addDays(createdAt, 5 + Math.floor(rng() * 25)) : null;
      const closedAt = status.isClosedState ? addDays(createdAt, 3 + Math.floor(rng() * 20)) : null;

      rows.push({
        id: randomUUID(),
        uniqueCode: `LOADTEST-${String(n).padStart(6, '0')}`,
        externalId: `${EXTERNAL_ID_PREFIX}${n}`,
        projectId: project.id,
        title: pick(rng, CLASH_TITLES),
        description: CLASH_DESCRIPTION,
        disciplineId: discipline.id,
        zoneId: zone.id,
        statusId: status.id,
        priorityId: priority.id,
        reporterId,
        assigneeId,
        dueDate,
        createdAt,
        closedAt,
      });
    }

    await prisma.clash.createMany({ data: rows });
    console.log(`  ...${Math.min(start + batchCount, count)}/${count}`);
  }

  console.log(`Selesai: ${count} clash uji beban ditambahkan ke proyek ${project.code}.`);
  console.log(`Bersihkan dengan: npx ts-node prisma/seed-load-test.ts --cleanup`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
