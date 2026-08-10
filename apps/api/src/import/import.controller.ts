import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { Role } from '@prisma/client';
import { ActiveProject } from '../common/decorators/active-project.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipProjectScope } from '../common/decorators/skip-project-scope.decorator';
import { AuthUser } from '../auth/auth.types';
import { UPLOAD_TMP_DIR } from '../storage/upload-tmp-dir';
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

  // Just parses/stores the uploaded file into a preview token — no project
  // data is touched yet, so no active project is needed until commit().
  // Throttled well below the global default: parsing a 10MB file is far
  // costlier per-request than the typical read/write this API otherwise
  // serves, so the 600/min default would let one user repeatedly saturate
  // the CPU/IO budget this route can burn.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @SkipProjectScope()
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: UPLOAD_TMP_DIR }),
      limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES },
    }),
  )
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.importService.preview(file);
  }

  @Post('commit')
  commit(
    @Body() dto: CommitImportDto,
    @CurrentUser() user: AuthUser,
    @ActiveProject() projectId: string,
  ) {
    return this.importService.commit(dto, user, projectId);
  }

  // No X-Project-Id required: authorization is resolved from the job's own
  // projectId (see ImportService.getJob), so polling works regardless of
  // whatever project happens to be active client-side at the time.
  @SkipProjectScope()
  @Get('jobs/:id')
  getJob(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.importService.getJob(id, user);
  }
}
