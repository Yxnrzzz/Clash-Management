import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClashesController } from './clashes.controller';
import { ClashesService } from './clashes.service';
import { AnnotationsController } from './annotations.controller';
import { AnnotationsService } from './annotations.service';

@Module({
  imports: [PrismaModule, StorageModule, NotificationsModule],
  controllers: [ClashesController, AnnotationsController],
  providers: [ClashesService, AnnotationsService],
  exports: [ClashesService],
})
export class ClashesModule {}
