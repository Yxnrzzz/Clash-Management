import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { unlink } from 'fs/promises';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { ActiveProject } from '../common/decorators/active-project.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
import { UPLOAD_TMP_DIR } from '../storage/upload-tmp-dir';
import {
  BulkUpdateClashDto,
  CreateClashDto,
  CreateCommentDto,
  DashboardMetricsQueryDto,
  ListClashesQueryDto,
  UpdateClashDto,
} from './dto/clash.dto';
import { ClashesService } from './clashes.service';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_TYPES = ['image/', 'application/pdf'];

/**
 * Reads are open to any signed-in user (Management needs the Register and
 * Dashboard too). Writes are role-gated per the PRD's permission matrix — see
 * ClashesService for the finer-grained rules @Roles() can't express (an
 * Engineer editing only their own item, one status step at a time).
 */
@Controller('clashes')
export class ClashesController {
  constructor(private readonly clashes: ClashesService) {}

  @Get()
  list(
    @Query() query: ListClashesQueryDto,
    @ActiveProject() projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clashes.list(query, projectId, user);
  }

  // Must come before @Get(':id') — Nest/Express match routes in declaration
  // order, so a metrics route declared after :id would be swallowed as
  // id="metrics" instead of matching this handler.
  @Get('metrics')
  metrics(@Query() query: DashboardMetricsQueryDto, @ActiveProject() projectId: string) {
    return this.clashes.metrics(query, projectId);
  }

  // Also must come before @Get(':id'), same reasoning as metrics above.
  // Backs the Register's Excel/PDF export — see ClashesService.export() for
  // why this is a separate route from list() rather than list() called with
  // a huge pageSize. Throttled well below the global default: even capped
  // at EXPORT_MAX_ROWS, this is a meaningfully heavier query than a normal
  // paginated page.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('export')
  export(
    @Query() query: ListClashesQueryDto,
    @ActiveProject() projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clashes.export(query, projectId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActiveProject() projectId: string) {
    return this.clashes.findDetail(id, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Post()
  create(
    @Body() dto: CreateClashDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.create(dto, user, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClashDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.update(id, dto, user, projectId);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.softDelete(id, user, projectId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.restore(id, user, projectId);
  }

  @Roles(Role.COORDINATOR, Role.ADMIN)
  @Post('bulk')
  bulkUpdate(
    @Body() dto: BulkUpdateClashDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.bulkUpdate(dto, user, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.MANAGEMENT, Role.ADMIN)
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.addComment(id, dto, user, projectId);
  }

  // Server-side re-validation of type/size/count: the frontend's own checks
  // (clashes/new/page.tsx) are UX only, not a security boundary. Throttled
  // below the global default — up to 10 files x 10MB per call is far
  // costlier than a typical request.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Post(':id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENTS, {
      storage: diskStorage({ destination: UPLOAD_TMP_DIR }),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  addAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    for (const file of files) {
      if (!ACCEPTED_ATTACHMENT_TYPES.some((t) => file.mimetype.startsWith(t))) {
        // Multer's diskStorage already wrote every file in this batch to
        // UPLOAD_TMP_DIR before this handler runs — clean all of them up
        // now instead of leaving them for the daily orphan-file sweep just
        // because one had the wrong type.
        for (const f of files) void unlink(f.path).catch(() => undefined);
        throw new BadRequestException('Tipe file harus gambar atau PDF');
      }
    }
    return this.clashes.addAttachments(id, files, user, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Delete(':clashId/attachments/:attachmentId')
  deleteAttachment(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.deleteAttachment(clashId, attachmentId, user, projectId);
  }

  @Get(':clashId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { attachment, stream } = await this.clashes.getAttachmentForDownload(
      clashId,
      attachmentId,
      user,
      projectId,
    );
    res.set({
      'Content-Type': attachment.fileType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    });
    return new StreamableFile(stream);
  }

  /**
   * Hands back a short-lived (5 min) signed URL for the same attachment
   * instead of streaming it directly — for embedding in <img src> where the
   * browser can't be made to carry the Authorization/X-Project-Id headers a
   * normal API call needs. Same RBAC/scoping as downloadAttachment above.
   */
  @Get(':clashId/attachments/:attachmentId/signed-url')
  getAttachmentSignedUrl(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.getAttachmentSignedUrl(clashId, attachmentId, user, projectId);
  }

  /**
   * @Public(): the whole point is that the browser hits this with no auth
   * headers at all, just the token+expiresAt query params issued above.
   * ProjectContextGuard also no-ops here (it only scopes requests that
   * carry an authenticated user — see its canActivate()).
   */
  @Public()
  @Get('attachments/:attachmentId/signed')
  async streamSignedAttachment(
    @Param('attachmentId') attachmentId: string,
    @Query('token') token: string,
    @Query('expiresAt') expiresAt: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { attachment, stream } = await this.clashes.streamBySignedToken(
      attachmentId,
      token,
      Number(expiresAt),
    );
    res.set({
      'Content-Type': attachment.fileType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    });
    return new StreamableFile(stream);
  }
}
