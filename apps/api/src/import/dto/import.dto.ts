import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';

/**
 * Mapping values are source column headers picked in the wizard's step 2,
 * not master-data ids — resolution happens per-row in ImportProcessor, not
 * here. Same reasoning as CreateClashDto's ids: plain strings, no @IsUUID().
 */
export class ImportMappingDto {
  @IsString()
  @MinLength(1, { message: 'Kolom judul wajib dipetakan' })
  title!: string;

  @IsString()
  @MinLength(1, { message: 'Kolom disiplin wajib dipetakan' })
  disciplineCode!: string;

  @IsString()
  @MinLength(1, { message: 'Kolom zona wajib dipetakan' })
  zoneName!: string;

  @IsString()
  @MinLength(1, { message: 'Kolom prioritas wajib dipetakan' })
  priorityName!: string;

  @IsString()
  @MinLength(1, { message: 'Kolom deskripsi wajib dipetakan' })
  description!: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}

export class CommitImportDto {
  // = the storageKey returned by POST /import/preview — always
  // `imports/<uuid>-<sanitized-filename>` (see StorageService.saveFromPath).
  // Constrained to that shape, not just non-empty, so this can never be used
  // to make StorageService open an arbitrary path outside its own prefix.
  @IsString()
  @Matches(/^imports\/[A-Za-z0-9._-]+$/, { message: 'Token file tidak valid, ulangi upload.' })
  token!: string;

  @IsString()
  @MinLength(1)
  fileName!: string;

  @ValidateNested()
  @Type(() => ImportMappingDto)
  mapping!: ImportMappingDto;

  @IsOptional()
  @IsBoolean()
  autoCreateMasterData?: boolean;
}
