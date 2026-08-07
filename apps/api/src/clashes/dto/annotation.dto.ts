import { AnnotationKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * `geometry`'s shape is a discriminated union keyed by `kind` (see
 * src/lib/annotations.ts on the frontend for the per-kind shapes) — not
 * expressible with class-validator decorators over a Json column, so it's
 * only checked here for "is an object at all"; AnnotationsService.parseGeometry()
 * does the real per-kind numeric/range validation.
 */
export class CreateAnnotationDto {
  @IsEnum(AnnotationKind, { message: 'Jenis markup tidak valid' })
  kind!: AnnotationKind;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Nomor halaman tidak valid' })
  pageNumber?: number;

  @IsObject({ message: 'Geometri markup tidak valid' })
  geometry!: Record<string, unknown>;

  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i, { message: 'Warna harus berupa kode hex, mis. #ef4444' })
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0005, { message: 'Ketebalan garis terlalu tipis' })
  @Max(0.05, { message: 'Ketebalan garis terlalu tebal' })
  strokeWidth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Teks markup maksimal 500 karakter' })
  text?: string;
}

/** `kind` is immutable — delete and recreate to change an annotation's type. */
export class UpdateAnnotationDto {
  @IsOptional()
  @IsObject({ message: 'Geometri markup tidak valid' })
  geometry?: Record<string, unknown>;

  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i, { message: 'Warna harus berupa kode hex, mis. #ef4444' })
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0005, { message: 'Ketebalan garis terlalu tipis' })
  @Max(0.05, { message: 'Ketebalan garis terlalu tebal' })
  strokeWidth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Teks markup maksimal 500 karakter' })
  text?: string;
}
