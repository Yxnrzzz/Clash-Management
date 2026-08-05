import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
import { CommitImportDto } from './dto/import.dto';
import { ImportService } from './import.service';

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Bulk import is Coordinator/Admin only, same gate the frontend wizard
 * already applies in src/app/import/page.tsx — enforced here at the class
 * level since every route in this controller needs it. */
@Roles(Role.COORDINATOR, Role.ADMIN)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.importService.preview(file);
  }

  @Post('commit')
  commit(@Body() dto: CommitImportDto, @CurrentUser() user: AuthUser) {
    return this.importService.commit(dto, user);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.importService.getJob(id, user);
  }
}
