import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Password saat ini wajib diisi' })
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'Password baru minimal 12 karakter' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password baru harus mengandung minimal satu huruf dan satu angka',
  })
  newPassword!: string;
}
