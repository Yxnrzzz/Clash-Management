import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ClashesModule } from '../clashes/clashes.module';
import { IMPORT_QUEUE } from './import.types';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportProcessor } from './import.processor';

@Module({
  imports: [PrismaModule, StorageModule, ClashesModule, BullModule.registerQueue({ name: IMPORT_QUEUE })],
  controllers: [ImportController],
  providers: [ImportService, ImportProcessor],
})
export class ImportModule {}
