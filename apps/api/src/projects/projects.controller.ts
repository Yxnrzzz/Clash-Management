import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipProjectScope } from '../common/decorators/skip-project-scope.decorator';
import { AuthUser } from '../auth/auth.types';
import { AddProjectMemberDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

/** This controller IS the source of "which projects can I use" — it can
 * never itself require an active project via X-Project-Id. */
@SkipProjectScope()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('current')
  findCurrent(@CurrentUser() user: AuthUser) {
    return this.projects.findCurrent(user);
  }

  /** Open to every signed-in user — filtered to their own memberships
   * unless their role administers every project (see CROSS_PROJECT_ROLES). */
  @Get()
  listAll(@CurrentUser() user: AuthUser) {
    return this.projects.listAll(user);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Get(':projectId/members')
  listMembers(@Param('projectId') projectId: string) {
    return this.projects.listMembers(projectId);
  }

  @Roles(Role.ADMIN)
  @Post(':projectId/members')
  addMember(@Param('projectId') projectId: string, @Body() dto: AddProjectMemberDto) {
    return this.projects.addMember(projectId, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':projectId/members/:userId')
  removeMember(@Param('projectId') projectId: string, @Param('userId') userId: string) {
    return this.projects.removeMember(projectId, userId);
  }
}
