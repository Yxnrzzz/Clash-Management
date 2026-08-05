import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateDisciplineDto {
  @IsString()
  @MinLength(2, { message: 'Kode disiplin minimal 2 karakter' })
  code!: string;

  @IsString()
  @MinLength(2, { message: 'Nama disiplin minimal 2 karakter' })
  name!: string;
}

export class UpdateDisciplineDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Kode disiplin minimal 2 karakter' })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama disiplin minimal 2 karakter' })
  name?: string;
}

export class CreateZoneDto {
  @IsString()
  @MinLength(1, { message: 'Nama zona wajib diisi' })
  name!: string;

  @IsString()
  @MinLength(1, { message: 'Level wajib diisi' })
  level!: string;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nama zona wajib diisi' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Level wajib diisi' })
  level?: string;
}

export class CreatePriorityDto {
  @IsString()
  @MinLength(1, { message: 'Nama prioritas wajib diisi' })
  name!: string;

  @IsInt({ message: 'Bobot harus bilangan bulat' })
  @Min(1, { message: 'Bobot minimal 1' })
  weight!: number;
}

export class UpdatePriorityDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nama prioritas wajib diisi' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Bobot harus bilangan bulat' })
  @Min(1, { message: 'Bobot minimal 1' })
  weight?: number;
}

/**
 * Statuses are intentionally not creatable or deletable: the frontend's
 * allowedStatusTransitions() depends on a fixed four-step chain keyed by
 * `sequence`. Only the label and the closed-state flag are editable.
 */
export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nama status wajib diisi' })
  name?: string;

  @IsOptional()
  @IsBoolean()
  isClosedState?: boolean;
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

/** Project ids are NOT uuids (seed uses "proj-1") — see the module-level note
 * in clash.dto.ts; same reasoning applies here. */
export class CopyTemplateDto {
  @IsString()
  @MinLength(1, { message: 'Proyek sumber tidak valid' })
  fromProjectId!: string;

  @IsString()
  @MinLength(1, { message: 'Proyek tujuan tidak valid' })
  toProjectId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Pilih minimal satu jenis data' })
  @IsIn(['disciplines', 'zones'], { each: true, message: 'Jenis data tidak valid' })
  include!: ('disciplines' | 'zones')[];
}
