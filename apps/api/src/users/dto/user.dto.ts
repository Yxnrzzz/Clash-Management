import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'Nama minimal 2 karakter' })
  name!: string;

  @IsEmail({}, { message: 'Format email tidak valid' })
  email!: string;

  @IsEnum(Role, { message: 'Peran tidak dikenal' })
  role!: Role;

  /** Optional: a random temporary password is generated (and returned once,
   * see UsersService.create) when omitted. */
  @IsOptional()
  @IsString()
  @MinLength(12, { message: 'Password minimal 12 karakter' })
  password?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama minimal 2 karakter' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid' })
  email?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Peran tidak dikenal' })
  role?: Role;
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
