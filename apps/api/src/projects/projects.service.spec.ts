import { ConflictException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma(existingCodes: string[] = []) {
  const project = {
    findUnique: jest.fn(({ where: { code } }: { where: { code: string } }) =>
      Promise.resolve(existingCodes.includes(code) ? { id: 'existing', code } : null),
    ),
    create: jest.fn(({ data }: { data: { name: string; code: string } }) =>
      Promise.resolve({ id: 'proj-new', ...data }),
    ),
  };

  const prisma = { project } as unknown as PrismaService;
  return { prisma, project };
}

describe('ProjectsService.create', () => {
  it('creates a project with the code trimmed and uppercased', async () => {
    const { prisma, project } = makePrisma();
    const service = new ProjectsService(prisma);

    const created = await service.create({ name: '  Menara Baru  ', code: ' bar ' });

    expect(project.create).toHaveBeenCalledWith({
      data: { name: 'Menara Baru', code: 'BAR' },
    });
    expect(created).toEqual({ id: 'proj-new', name: 'Menara Baru', code: 'BAR' });
  });

  it('rejects a code that is already taken, case-insensitively via normalization', async () => {
    const { prisma, project } = makePrisma(['BAR']);
    const service = new ProjectsService(prisma);

    await expect(service.create({ name: 'Menara Baru', code: 'bar' })).rejects.toThrow(
      ConflictException,
    );
    expect(project.create).not.toHaveBeenCalled();
  });
});
