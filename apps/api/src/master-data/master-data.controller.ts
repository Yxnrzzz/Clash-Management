import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
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
  listDisciplines() {
    return this.masterData.listDisciplines();
  }

  @Roles(Role.ADMIN)
  @Post('disciplines')
  createDiscipline(@Body() dto: CreateDisciplineDto) {
    return this.masterData.createDiscipline(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('disciplines/:id')
  updateDiscipline(@Param('id') id: string, @Body() dto: UpdateDisciplineDto) {
    return this.masterData.updateDiscipline(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('disciplines/:id/active')
  setDisciplineActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.masterData.setDisciplineActive(id, dto.isActive);
  }

  @Get('zones')
  listZones() {
    return this.masterData.listZones();
  }

  @Roles(Role.ADMIN)
  @Post('zones')
  createZone(@Body() dto: CreateZoneDto) {
    return this.masterData.createZone(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.masterData.updateZone(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('zones/:id/active')
  setZoneActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.masterData.setZoneActive(id, dto.isActive);
  }

  @Get('priorities')
  listPriorities() {
    return this.masterData.listPriorities();
  }

  @Roles(Role.ADMIN)
  @Post('priorities')
  createPriority(@Body() dto: CreatePriorityDto) {
    return this.masterData.createPriority(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('priorities/:id')
  updatePriority(@Param('id') id: string, @Body() dto: UpdatePriorityDto) {
    return this.masterData.updatePriority(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('priorities/:id/active')
  setPriorityActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.masterData.setPriorityActive(id, dto.isActive);
  }

  @Get('statuses')
  listStatuses() {
    return this.masterData.listStatuses();
  }

  @Roles(Role.ADMIN)
  @Patch('statuses/:id')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.masterData.updateStatus(id, dto);
  }

  @Roles(Role.ADMIN)
  @Post('templates/copy')
  copyTemplate(@Body() dto: CopyTemplateDto) {
    return this.masterData.copyTemplate(dto);
  }
}
