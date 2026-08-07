import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Splits a comma-separated query param into a trimmed, non-empty string[]. */
function splitCsv(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

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
 * reassign, Coordinator/Admin may do both). assigneeId is further
 * restricted to active Engineers (or null) regardless of caller role —
 * see ClashesService.assertAssigneeIsEngineer().
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

const SORTABLE_FIELDS = ['kodeUnik', 'judul', 'status', 'priority', 'dueDate', 'createdAt'] as const;

/**
 * Query params for GET /clashes. Mirrors the shape RegisterView.tsx already
 * builds for its URL (see FiltersState in RegisterView.tsx) so the frontend
 * can forward its filter state to the server almost verbatim.
 *
 * pageSize's cap (10000, not the register's page size of 10) is what lets
 * export reuse this same endpoint instead of needing a second one: export
 * asks for page=1&pageSize=10000 to get every matching row unpaginated.
 */
export class ListClashesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsString({ each: true })
  disc?: string[];

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsString({ each: true })
  stat?: string[];

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsString({ each: true })
  prio?: string[];

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsString({ each: true })
  zone?: string[];

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsString({ each: true })
  assignee?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  reporterId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Format tanggal "dibuat dari" tidak valid' })
  cf?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Format tanggal "dibuat sampai" tidak valid' })
  ct?: string;

  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true')
  overdue?: boolean;

  // Trash bin view — Admin only, enforced in ClashesService.list().
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true')
  deleted?: boolean;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS, { message: 'Field sort tidak valid' })
  sort: (typeof SORTABLE_FIELDS)[number] = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pageSize = 10;
}

export class DashboardMetricsQueryDto {
  @IsOptional()
  @IsISO8601(undefined, { message: 'Format tanggal "dari" tidak valid' })
  from?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Format tanggal "sampai" tidak valid' })
  to?: string;
}
