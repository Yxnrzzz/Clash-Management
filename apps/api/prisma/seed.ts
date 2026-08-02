import { PrismaClient, Role } from '@prisma/client';
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
