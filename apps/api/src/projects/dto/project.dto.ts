import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** code becomes the uniqueCode prefix for every clash created in this
 * project (see ClashesService.createClashRecord) — kept short and
 * alphanumeric-only for readable codes like "MCA-ARS-0001". */
export class CreateProjectDto {
  @IsString()
  @MinLength(2, { message: 'Nama proyek minimal 2 karakter' })
  name!: string;

  @IsString()
  @MinLength(2, { message: 'Kode proyek minimal 2 karakter' })
  @MaxLength(6, { message: 'Kode proyek maksimal 6 karakter' })
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Kode hanya boleh huruf/angka' })
  code!: string;
}

/** code validation deliberately mirrors CreateProjectDto's — a rename
 * becomes the new uniqueCode prefix for every clash in the project (see
 * ProjectsService.update), so it can't be laxer than create's. */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama proyek minimal 2 karakter' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Kode proyek minimal 2 karakter' })
  @MaxLength(6, { message: 'Kode proyek maksimal 6 karakter' })
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Kode hanya boleh huruf/angka' })
  code?: string;
}

export class ListProjectsQueryDto {
  // Admin-only in practice — ProjectsService.listAll ignores this for
  // everyone else. Same '1'/'true' string-to-boolean convention as
  // ListClashesQueryDto's `deleted`/`overdue` flags.
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}

export class AddProjectMemberDto {
  @IsString()
  @MinLength(1, { message: 'User tidak valid' })
  userId!: string;

  @IsString()
  @MinLength(1, { message: 'Peran proyek tidak valid' })
  projectRole!: string;
}
