import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.types';

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
