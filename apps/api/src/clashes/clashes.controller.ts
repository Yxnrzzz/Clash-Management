import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  BulkUpdateClashDto,
  CreateClashDto,
  CreateCommentDto,
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
  list() {
    return this.clashes.list();
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
