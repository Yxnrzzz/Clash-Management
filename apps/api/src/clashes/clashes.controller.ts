import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
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
  list(@Query() query: ListClashesQueryDto) {
    return this.clashes.list(query);
  }

  // Must come before @Get(':id') — Nest/Express match routes in declaration
  // order, so a metrics route declared after :id would be swallowed as
  // id="metrics" instead of matching this handler.
  @Get('metrics')
  metrics(@Query() query: DashboardMetricsQueryDto) {
    return this.clashes.metrics(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clashes.findDetail(id);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClashDto, @CurrentUser() user: AuthUser) {
    return this.clashes.create(dto, user);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClashDto, @CurrentUser() user: AuthUser) {
    return this.clashes.update(id, dto, user);
  }

  @Roles(Role.COORDINATOR, Role.ADMIN)
  @Post('bulk')
  bulkUpdate(@Body() dto: BulkUpdateClashDto, @CurrentUser() user: AuthUser) {
    return this.clashes.bulkUpdate(dto, user);
  }

  @Roles(Role.ENGINEER, Role.COORDINATOR, Role.ADMIN)
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clashes.addComment(id, dto, user);
  }
}
