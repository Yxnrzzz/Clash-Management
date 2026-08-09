import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipProjectScope } from '../common/decorators/skip-project-scope.decorator';
import { AuthUser } from '../auth/auth.types';
import { CreateUserDto, SetActiveDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

/** User management is global, not scoped to any single project. */
@SkipProjectScope()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Open to every signed-in user — the Register needs the assignee list —
   * but scoped by role inside UsersService.findAll: an Engineer only sees
   * users who share a project with them, not the whole org's directory. */
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.users.findAll(user);
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

  /** Returns the new temporary password once, in the response body — there
   * is no other way to retrieve it afterwards. See UsersService.resetPassword. */
  @Roles(Role.ADMIN)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.users.resetPassword(id);
  }
}
