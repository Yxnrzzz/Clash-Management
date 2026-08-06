import {
  BadRequestException,
  Body,
  Controller,
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
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { ActiveProject } from '../common/decorators/active-project.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
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
  list(@Query() query: ListClashesQueryDto, @ActiveProject() projectId: string) {
    return this.clashes.list(query, projectId);
  }

  // Must come before @Get(':id') — Nest/Express match routes in declaration
  // order, so a metrics route declared after :id would be swallowed as
  // id="metrics" instead of matching this handler.
  @Get('metrics')
  metrics(@Query() query: DashboardMetricsQueryDto, @ActiveProject() projectId: string) {
    return this.clashes.metrics(query, projectId);
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

  @Roles(Role.COORDINATOR, Role.ADMIN)
  @Post('bulk')
  bulkUpdate(
    @Body() dto: BulkUpdateClashDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.clashes.bulkUpdate(dto, user, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
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
  // (clashes/new/page.tsx) are UX only, not a security boundary.
  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Post(':id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENTS, { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }),
  )
  addAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    for (const file of files) {
      if (!ACCEPTED_ATTACHMENT_TYPES.some((t) => file.mimetype.startsWith(t))) {
        throw new BadRequestException('Tipe file harus gambar atau PDF');
      }
    }
    return this.clashes.addAttachments(id, files, user, projectId);
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
}
