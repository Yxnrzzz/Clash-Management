import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama proyek minimal 2 karakter' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Kode proyek minimal 2 karakter' })
  code?: string;
}
