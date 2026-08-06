import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ActiveProject } from '../common/decorators/active-project.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipProjectScope } from '../common/decorators/skip-project-scope.decorator';
import {
  CopyTemplateDto,
  CreateDisciplineDto,
  CreatePriorityDto,
  CreateZoneDto,
  SetActiveDto,
  UpdateDisciplineDto,
  UpdatePriorityDto,
  UpdateStatusDto,
  UpdateZoneDto,
} from './dto/master-data.dto';
import { MasterDataService } from './master-data.service';

/** Reads are open to any signed-in user; every write is Admin-only. */
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('disciplines')
  listDisciplines(@ActiveProject() projectId: string) {
    return this.masterData.listDisciplines(projectId);
  }

  @Roles(Role.ADMIN)
  @Post('disciplines')
  createDiscipline(@Body() dto: CreateDisciplineDto, @ActiveProject() projectId: string) {
    return this.masterData.createDiscipline(dto, projectId);
  }

  @Roles(Role.ADMIN)
  @Patch('disciplines/:id')
  updateDiscipline(
    @Param('id') id: string,
    @Body() dto: UpdateDisciplineDto,
    @ActiveProject() projectId: string,
  ) {
    return this.masterData.updateDiscipline(id, dto, projectId);
  }

  @Roles(Role.ADMIN)
  @Patch('disciplines/:id/active')
  setDisciplineActive(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @ActiveProject() projectId: string,
  ) {
    return this.masterData.setDisciplineActive(id, dto.isActive, projectId);
  }

  @Get('zones')
  listZones(@ActiveProject() projectId: string) {
    return this.masterData.listZones(projectId);
  }

  @Roles(Role.ADMIN)
  @Post('zones')
  createZone(@Body() dto: CreateZoneDto, @ActiveProject() projectId: string) {
    return this.masterData.createZone(dto, projectId);
  }

  @Roles(Role.ADMIN)
  @Patch('zones/:id')
  updateZone(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @ActiveProject() projectId: string,
  ) {
    return this.masterData.updateZone(id, dto, projectId);
  }

  @Roles(Role.ADMIN)
  @Patch('zones/:id/active')
  setZoneActive(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @ActiveProject() projectId: string,
  ) {
    return this.masterData.setZoneActive(id, dto.isActive, projectId);
  }

  // Priorities and Statuses are global across projects (out of scope for the
  // multi-project migration — see AGENTS/handoff notes), so these routes
  // don't require an active project at all.
  @SkipProjectScope()
  @Get('priorities')
  listPriorities() {
    return this.masterData.listPriorities();
  }

  @SkipProjectScope()
  @Roles(Role.ADMIN)
  @Post('priorities')
  createPriority(@Body() dto: CreatePriorityDto) {
    return this.masterData.createPriority(dto);
  }

  @SkipProjectScope()
  @Roles(Role.ADMIN)
  @Patch('priorities/:id')
  updatePriority(@Param('id') id: string, @Body() dto: UpdatePriorityDto) {
    return this.masterData.updatePriority(id, dto);
  }

  @SkipProjectScope()
  @Roles(Role.ADMIN)
  @Patch('priorities/:id/active')
  setPriorityActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.masterData.setPriorityActive(id, dto.isActive);
  }

  @SkipProjectScope()
  @Get('statuses')
  listStatuses() {
    return this.masterData.listStatuses();
  }

  @SkipProjectScope()
  @Roles(Role.ADMIN)
  @Patch('statuses/:id')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.masterData.updateStatus(id, dto);
  }

  // Explicitly cross-project by design (fromProjectId/toProjectId in the body).
  @SkipProjectScope()
  @Roles(Role.ADMIN)
  @Post('templates/copy')
  copyTemplate(@Body() dto: CopyTemplateDto) {
    return this.masterData.copyTemplate(dto);
  }
}
