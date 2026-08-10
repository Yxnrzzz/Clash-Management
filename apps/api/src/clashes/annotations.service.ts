import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnotationKind, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { ClashesService } from './clashes.service';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/annotation.dto';

const MAX_FREEHAND_POINTS = 2000;
const MAX_GEOMETRY_BYTES = 64 * 1024;

/**
 * Markup is shared (every project member sees every annotation on an
 * attachment) but writes are keyed on authorship: the author, or
 * Coordinator/Admin, may edit/delete a given annotation — see
 * assertOwnerOrCoordinator(). Kept as its own service (not folded into
 * ClashesService, already ~800 lines) but reuses
 * ClashesService.assertAttachmentInClash() for the same clash/project
 * scoping every other attachment-nested route relies on.
 */
@Injectable()
export class AnnotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clashes: ClashesService,
  ) {}

  async list(clashId: string, attachmentId: string, projectId: string) {
    await this.clashes.assertAttachmentInClash(clashId, attachmentId, projectId);
    return this.prisma.annotation.findMany({
      where: { attachmentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    clashId: string,
    attachmentId: string,
    dto: CreateAnnotationDto,
    user: AuthUser,
    projectId: string,
  ) {
    await this.clashes.assertAttachmentInClash(clashId, attachmentId, projectId);
    const geometry = this.parseGeometry(dto.kind, dto.geometry);

    return this.prisma.annotation.create({
      data: {
        attachmentId,
        pageNumber: dto.pageNumber ?? 1,
        authorId: user.id,
        kind: dto.kind,
        geometry: geometry as Prisma.InputJsonValue,
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.strokeWidth !== undefined ? { strokeWidth: dto.strokeWidth } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
      },
    });
  }

  async update(
    clashId: string,
    attachmentId: string,
    annotationId: string,
    dto: UpdateAnnotationDto,
    user: AuthUser,
    projectId: string,
  ) {
    const annotation = await this.findInAttachment(clashId, attachmentId, annotationId, projectId);
    this.assertOwnerOrCoordinator(user, annotation.authorId);

    const geometry = dto.geometry !== undefined ? this.parseGeometry(annotation.kind, dto.geometry) : undefined;

    return this.prisma.annotation.update({
      where: { id: annotationId },
      data: {
        ...(geometry !== undefined ? { geometry: geometry as Prisma.InputJsonValue } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.strokeWidth !== undefined ? { strokeWidth: dto.strokeWidth } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
      },
    });
  }

  async remove(clashId: string, attachmentId: string, annotationId: string, user: AuthUser, projectId: string) {
    const annotation = await this.findInAttachment(clashId, attachmentId, annotationId, projectId);
    this.assertOwnerOrCoordinator(user, annotation.authorId);

    await this.prisma.annotation.delete({ where: { id: annotationId } });
    return { id: annotationId };
  }

  private async findInAttachment(clashId: string, attachmentId: string, annotationId: string, projectId: string) {
    await this.clashes.assertAttachmentInClash(clashId, attachmentId, projectId);

    const annotation = await this.prisma.annotation.findUnique({ where: { id: annotationId } });
    if (!annotation || annotation.attachmentId !== attachmentId) {
      throw new NotFoundException('Markup tidak ditemukan.');
    }
    return annotation;
  }

  private assertOwnerOrCoordinator(user: AuthUser, authorId: string) {
    if (user.role === Role.COORDINATOR || user.role === Role.ADMIN) return;
    if (user.role === Role.ENGINEER && authorId === user.id) return;
    throw new ForbiddenException('Anda hanya dapat mengubah markup milik Anda sendiri.');
  }

  /**
   * `geometry` is a Json column, so its shape can't be enforced by
   * class-validator decorators on the DTO — checked here instead: every
   * coordinate must be a finite number in [0,1] (normalized against the
   * page's intrinsic box, see src/lib/annotations.ts on the frontend),
   * freehand strokes are capped in point count, and the whole payload is
   * capped in serialized size. Without this a client could stash arbitrary
   * blobs in the column.
   */
  private parseGeometry(kind: AnnotationKind, raw: Record<string, unknown>): Record<string, unknown> {
    if (JSON.stringify(raw).length > MAX_GEOMETRY_BYTES) {
      throw new BadRequestException('Geometri markup terlalu besar.');
    }

    const num = (value: unknown): number => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new BadRequestException('Koordinat markup harus berupa angka antara 0 dan 1.');
      }
      return value;
    };

    switch (kind) {
      case AnnotationKind.RECT: {
        const { x, y, w, h } = raw;
        const geo = { x: num(x), y: num(y), w: num(w), h: num(h) };
        if (geo.w <= 0 || geo.h <= 0) {
          throw new BadRequestException('Ukuran kotak markup tidak valid.');
        }
        return geo;
      }
      case AnnotationKind.ARROW: {
        const { x1, y1, x2, y2 } = raw;
        return { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) };
      }
      case AnnotationKind.FREEHAND: {
        const { points } = raw;
        if (!Array.isArray(points) || points.length === 0) {
          throw new BadRequestException('Titik freehand tidak valid.');
        }
        if (points.length > MAX_FREEHAND_POINTS) {
          throw new BadRequestException(`Freehand maksimal ${MAX_FREEHAND_POINTS} titik.`);
        }
        const parsed = points.map((p) => {
          if (!Array.isArray(p) || p.length !== 2) {
            throw new BadRequestException('Titik freehand tidak valid.');
          }
          return [num(p[0]), num(p[1])];
        });
        return { points: parsed };
      }
      case AnnotationKind.TEXT: {
        const { x, y, size } = raw;
        return { x: num(x), y: num(y), size: num(size) };
      }
    }
  }
}
