import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

/**
 * IDs here deliberately mirror `src/lib/mock-data.ts` in the Next.js app instead
 * of using the schema's uuid() defaults.
 *
 * While the frontend is in its hybrid phase — master data served by this API but
 * clashes still living in the browser's localStorage — every mock clash holds a
 * foreign key like `disciplineId: "disc-ars"`. Random uuids here would orphan all
 * of them and blank out the Register and Dashboard. Keeping the ids identical
 * makes both halves line up, and costs nothing once clashes move to the database.
 */

const DEMO_PASSWORD = 'demo1234';

const PROJECT = { id: 'proj-1', name: 'Menara Cendana — Tower A', code: 'MCA' };

const STATUSES = [
  { id: 'st-open', name: 'Open', sequence: 1, isClosedState: false },
  { id: 'st-inprogress', name: 'In Progress', sequence: 2, isClosedState: false },
  { id: 'st-resolved', name: 'Resolved', sequence: 3, isClosedState: false },
  { id: 'st-closed', name: 'Closed', sequence: 4, isClosedState: true },
];

const PRIORITIES = [
  { id: 'pr-low', name: 'Low', weight: 1 },
  { id: 'pr-medium', name: 'Medium', weight: 2 },
  { id: 'pr-high', name: 'High', weight: 3 },
  { id: 'pr-critical', name: 'Critical', weight: 4 },
];

const DISCIPLINES = [
  { id: 'disc-ars', code: 'ARS', name: 'Arsitektur' },
  { id: 'disc-str', code: 'STR', name: 'Struktur' },
  { id: 'disc-mep', code: 'MEP', name: 'Mekanikal/Elektrikal/Plumbing' },
  { id: 'disc-other', code: 'OTH', name: 'Lainnya' },
];

const ZONES = [
  { id: 'zone-1', name: 'Zona A', level: 'Lantai 1' },
  { id: 'zone-2', name: 'Zona B', level: 'Lantai 1' },
  { id: 'zone-3', name: 'Zona A', level: 'Lantai 2' },
  { id: 'zone-4', name: 'Zona B', level: 'Lantai 2' },
  { id: 'zone-5', name: 'Zona Core', level: 'Lantai 3' },
  { id: 'zone-6', name: 'Basement', level: 'B1' },
];

const USERS = [
  { id: 'u-eng', name: 'Dimas Prasetyo', email: 'engineer@clashhub.dev', role: Role.ENGINEER },
  { id: 'u-coord', name: 'Siti Rahmawati', email: 'coordinator@clashhub.dev', role: Role.COORDINATOR },
  { id: 'u-mgmt', name: 'Bambang Wijaya', email: 'management@clashhub.dev', role: Role.MANAGEMENT },
  { id: 'u-admin', name: 'Admin ClashHub', email: 'admin@clashhub.dev', role: Role.ADMIN },
  { id: 'u-eng2', name: 'Rizky Ananda', email: 'rizky@clashhub.dev', role: Role.ENGINEER },
  { id: 'u-coord2', name: 'Putri Lestari', email: 'putri@clashhub.dev', role: Role.COORDINATOR },
];

/**
 * Demo clash data, ported from src/lib/mock-data.ts (generateSeedData) now
 * that clashes live in the database instead of the browser's localStorage.
 * Same deterministic mulberry32 RNG and seed value (42) so the generated
 * dataset is identical to what the frontend used to produce locally.
 */
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
  'Panel listrik bentrok dengan railing tangga darurat',
  'Bentrok grating floor dengan pipa chiller',
  'Jalur kabel tray menembus balok utama',
  'Ruang AHU tidak cukup untuk maintenance',
  'Sparing plumbing tidak sesuai shop drawing struktur',
];

const CLASH_DESCRIPTION =
  'Hasil koordinasi model menunjukkan potensi bentrok antar elemen pada zona ini. Perlu verifikasi lapangan dan revisi shop drawing sebelum instalasi lanjutan.';

const REPORTER_IDS = ['u-eng', 'u-eng2', 'u-coord', 'u-coord2'];
const ASSIGNEE_IDS: (string | null)[] = ['u-eng', 'u-eng2', 'u-coord', 'u-coord2', null];

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

async function seedClashes(projectCode: string) {
  const existing = await prisma.clash.count();
  if (existing > 0) {
    console.log(`Clash sudah ada (${existing}), lewati seeding clash.`);
    return;
  }

  const rng = mulberry32(42);
  const now = new Date('2026-07-31T09:00:00');
  const disciplineCounters: Record<string, number> = {};

  const clashRows: Prisma.ClashCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const commentRows: Prisma.CommentCreateManyInput[] = [];

  const count = 87;
  for (let i = 0; i < count; i++) {
    const discipline = pick(rng, DISCIPLINES);
    const zone = pick(rng, ZONES);
    const priority = pick(rng, PRIORITIES);
    const statusRoll = rng();
    const status =
      statusRoll < 0.35
        ? STATUSES[0]
        : statusRoll < 0.6
          ? STATUSES[1]
          : statusRoll < 0.8
            ? STATUSES[2]
            : STATUSES[3];
    const reporterId = pick(rng, REPORTER_IDS);
    const assigneeId = pick(rng, ASSIGNEE_IDS);
    const createdAt = addDays(now, -Math.floor(rng() * 90));
    const dueDate = rng() < 0.85 ? addDays(createdAt, 5 + Math.floor(rng() * 25)) : null;
    const closedAt = status.isClosedState ? addDays(createdAt, 3 + Math.floor(rng() * 20)) : null;

    disciplineCounters[discipline.code] = (disciplineCounters[discipline.code] ?? 0) + 1;
    const uniqueCode = `${projectCode}-${discipline.code}-${String(
      disciplineCounters[discipline.code],
    ).padStart(4, '0')}`;
    const id = randomUUID();

    clashRows.push({
      id,
      uniqueCode,
      projectId: PROJECT.id,
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

    auditRows.push({
      clashId: id,
      actorId: reporterId,
      action: 'created',
      createdAt,
    });

    if (assigneeId) {
      auditRows.push({
        clashId: id,
        actorId: 'u-coord',
        action: 'updated',
        field: 'assigneeId',
        oldValue: '-',
        newValue: USERS.find((u) => u.id === assigneeId)?.name ?? assigneeId,
        createdAt: addDays(createdAt, 1),
      });
    }

    if (status.sequence > 1) {
      auditRows.push({
        clashId: id,
        actorId: assigneeId ?? 'u-coord',
        action: 'updated',
        field: 'statusId',
        oldValue: 'Open',
        newValue: status.name,
        createdAt: addDays(createdAt, 2),
      });
    }

    if (rng() < 0.4) {
      commentRows.push({
        clashId: id,
        authorId: assigneeId ?? reporterId,
        content:
          'Sudah dicek di lapangan, perlu koordinasi ulang dengan tim STR untuk revisi elevasi.',
        createdAt: addDays(createdAt, 2),
      });
    }
  }

  await prisma.clash.createMany({ data: clashRows });
  await prisma.auditLog.createMany({ data: auditRows });
  await prisma.comment.createMany({ data: commentRows });

  console.log(`Seed clash selesai: ${clashRows.length} clash, ${auditRows.length} audit log, ${commentRows.length} komentar.`);
}

async function main() {
  const project = await prisma.project.upsert({
    where: { id: PROJECT.id },
    update: { name: PROJECT.name, code: PROJECT.code },
    create: PROJECT,
  });

  for (const status of STATUSES) {
    await prisma.status.upsert({ where: { id: status.id }, update: status, create: status });
  }

  for (const priority of PRIORITIES) {
    await prisma.priority.upsert({
      where: { id: priority.id },
      update: priority,
      create: priority,
    });
  }

  for (const discipline of DISCIPLINES) {
    const data = { ...discipline, projectId: project.id };
    await prisma.discipline.upsert({ where: { id: data.id }, update: data, create: data });
  }

  for (const zone of ZONES) {
    const data = { ...zone, projectId: project.id };
    await prisma.zone.upsert({ where: { id: data.id }, update: data, create: data });
  }

  const passwordHash = await hash(DEMO_PASSWORD);

  for (const user of USERS) {
    // passwordHash is left out of `update` so re-seeding never resets a password
    // an admin may have changed.
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name, email: user.email, role: user.role },
      create: { ...user, passwordHash },
    });

    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      update: { projectRole: user.role },
      create: { projectId: project.id, userId: user.id, projectRole: user.role },
    });
  }

  await seedClashes(project.code);

  console.log('Seed selesai:', {
    project: project.code,
    statuses: STATUSES.map((s) => s.name),
    priorities: PRIORITIES.map((p) => p.name),
    disciplines: DISCIPLINES.map((d) => d.code),
    zones: ZONES.map((z) => `${z.name} / ${z.level}`),
    users: USERS.map((u) => u.email),
    password: DEMO_PASSWORD,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
