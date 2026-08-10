import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ActiveProject } from '../common/decorators/active-project.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
import { AnnotationsService } from './annotations.service';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/annotation.dto';

/**
 * Nested under the attachment, matching :clashId/attachments/:attachmentId/...
 * elsewhere in ClashesController — the URL states the ownership chain, and
 * every handler reuses ClashesService.assertAttachmentInClash() for the same
 * clash/project scoping. Reads have no @Roles(): markup is shared with every
 * project member, including Management.
 */
@Controller('clashes')
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @Get(':clashId/attachments/:attachmentId/annotations')
  list(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @ActiveProject() projectId: string,
  ) {
    return this.annotations.list(clashId, attachmentId, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Post(':clashId/attachments/:attachmentId/annotations')
  create(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() dto: CreateAnnotationDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.annotations.create(clashId, attachmentId, dto, user, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Patch(':clashId/attachments/:attachmentId/annotations/:annotationId')
  update(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @Param('annotationId') annotationId: string,
    @Body() dto: UpdateAnnotationDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.annotations.update(clashId, attachmentId, annotationId, dto, user, projectId);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Delete(':clashId/attachments/:attachmentId/annotations/:annotationId')
  remove(
    @Param('clashId') clashId: string,
    @Param('attachmentId') attachmentId: string,
    @Param('annotationId') annotationId: string,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.annotations.remove(clashId, attachmentId, annotationId, user, projectId);
  }
}
