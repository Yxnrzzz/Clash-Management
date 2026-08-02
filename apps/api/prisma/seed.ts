import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.upsert({
    where: { code: 'PMW-01' },
    update: {},
    create: {
      name: 'Proyek Menara Wijaya',
      code: 'PMW-01',
    },
  });

  const [open, inProgress, resolved, closed] = await Promise.all([
    prisma.status.create({ data: { name: 'Open', sequence: 1, isClosedState: false } }),
    prisma.status.create({ data: { name: 'In Progress', sequence: 2, isClosedState: false } }),
    prisma.status.create({ data: { name: 'Resolved', sequence: 3, isClosedState: false } }),
    prisma.status.create({ data: { name: 'Closed', sequence: 4, isClosedState: true } }),
  ]);

  const [low, medium, high, critical] = await Promise.all([
    prisma.priority.create({ data: { name: 'Low', weight: 1 } }),
    prisma.priority.create({ data: { name: 'Medium', weight: 2 } }),
    prisma.priority.create({ data: { name: 'High', weight: 3 } }),
    prisma.priority.create({ data: { name: 'Critical', weight: 4 } }),
  ]);

  const disciplines = await Promise.all([
    prisma.discipline.create({ data: { projectId: project.id, code: 'ARS', name: 'Arsitektur' } }),
    prisma.discipline.create({ data: { projectId: project.id, code: 'STR', name: 'Struktur' } }),
    prisma.discipline.create({ data: { projectId: project.id, code: 'MEP', name: 'MEP' } }),
    prisma.discipline.create({ data: { projectId: project.id, code: 'OTH', name: 'Lainnya' } }),
  ]);

  const zones = await Promise.all([
    prisma.zone.create({ data: { projectId: project.id, name: 'Zona A', level: 'L1' } }),
    prisma.zone.create({ data: { projectId: project.id, name: 'Zona B', level: 'L2' } }),
    prisma.zone.create({ data: { projectId: project.id, name: 'Zona C', level: 'Roof' } }),
  ]);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Admin',
        email: 'admin@clashhub.com',
        passwordHash: 'password',
        role: Role.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Coordinator',
        email: 'coord@clashhub.com',
        passwordHash: 'password',
        role: Role.COORDINATOR,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Engineer',
        email: 'eng@clashhub.com',
        passwordHash: 'password',
        role: Role.ENGINEER,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Management',
        email: 'mgmt@clashhub.com',
        passwordHash: 'password',
        role: Role.MANAGEMENT,
      },
    }),
  ]);

  await Promise.all(
    users.map((user) =>
      prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: user.id,
          projectRole: user.role,
        },
      }),
    ),
  );

  console.log('Seed selesai:', {
    project: project.code,
    statuses: [open, inProgress, resolved, closed].map((s) => s.name),
    priorities: [low, medium, high, critical].map((p) => p.name),
    disciplines: disciplines.map((d) => d.code),
    zones: zones.map((z) => z.name),
    users: users.map((u) => u.email),
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
