import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ClashHub is single-project today (see the Admin > Proyek page), so "current"
   * means the oldest project row rather than something resolved per user.
   */
  async findCurrent() {
    const project = await this.prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!project) throw new NotFoundException('Belum ada proyek.');
    return { id: project.id, name: project.name, code: project.code };
  }

  /** Admin-only (see ProjectsController) — used by the master-data "copy
   * template" dialog to pick a source/target project. */
  async listAll() {
    const projects = await this.prisma.project.findMany({ orderBy: { name: 'asc' } });
    return projects.map((p) => ({ id: p.id, name: p.name, code: p.code }));
  }

  async update(id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proyek tidak ditemukan.');

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      },
    });
    return { id: project.id, name: project.name, code: project.code };
  }
}
