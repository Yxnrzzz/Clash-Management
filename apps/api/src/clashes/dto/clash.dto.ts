import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Master-data ids (discipline/zone/priority/status) are NOT guaranteed to be
 * UUIDs: the seed uses fixed human-readable ids ("disc-ars", "st-open", …) so
 * mock frontend data lines up with it (see prisma/seed.ts), while ids created
 * later through the Admin UI get real uuid() defaults. Validate these as
 * plain non-empty strings — @IsUUID would reject every seeded row.
 */

export class CreateClashDto {
  @IsString()
  @MinLength(3, { message: 'Judul minimal 3 karakter' })
  title!: string;

  @IsString()
  @MinLength(3, { message: 'Deskripsi minimal 3 karakter' })
  description!: string;

  @IsString()
  @MinLength(1, { message: 'Disiplin tidak valid' })
  disciplineId!: string;

  @IsString()
  @MinLength(1, { message: 'Zona tidak valid' })
  zoneId!: string;

  @IsString()
  @MinLength(1, { message: 'Prioritas tidak valid' })
  priorityId!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Format tanggal tidak valid' })
  dueDate?: string;
}

/**
 * A clash's editable surface is a mix of one status transition and three
 * triage fields. All four are optional here — ClashesService decides per
 * field whether the caller's role may touch it, since that can't be
 * expressed with @Roles() alone (Engineer may move status but never
 * reassign, Coordinator/Admin may do both).
 */
export class UpdateClashDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Status tidak valid' })
  statusId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Prioritas tidak valid' })
  priorityId?: string;

  // Explicit null clears the assignee; anything else must be a non-empty id.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1, { message: 'Assignee tidak valid' })
  assigneeId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601(undefined, { message: 'Format tanggal tidak valid' })
  dueDate?: string | null;
}

export class BulkUpdatePatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Status tidak valid' })
  statusId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Prioritas tidak valid' })
  priorityId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1, { message: 'Assignee tidak valid' })
  assigneeId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601(undefined, { message: 'Format tanggal tidak valid' })
  dueDate?: string | null;
}

export class BulkUpdateClashDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Pilih minimal satu clash' })
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true, message: 'ID clash tidak valid' })
  ids!: string[];

  @ValidateNested()
  @Type(() => BulkUpdatePatchDto)
  patch!: BulkUpdatePatchDto;
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1, { message: 'Komentar tidak boleh kosong' })
  content!: string;
}
