import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClashesController } from './clashes.controller';
import { ClashesService } from './clashes.service';

@Module({
  imports: [PrismaModule, StorageModule, NotificationsModule],
  controllers: [ClashesController],
  providers: [ClashesService],
})
export class ClashesModule {}
