import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipProjectScope } from '../common/decorators/skip-project-scope.decorator';
import { CreateUserDto, SetActiveDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

/** User management is global, not scoped to any single project. */
@SkipProjectScope()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Open to every signed-in user — the Register needs the assignee list. */
  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.users.setActive(id, dto.isActive);
  }
}
