import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE, NotificationJobData } from './notifications.types';

/** Producer side: enqueues notification jobs. NotificationsProcessor consumes them. */
@Injectable()
export class NotificationsService {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationJobData>) {}

  private enqueue(data: NotificationJobData) {
    return this.queue.add(data.type, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  enqueueAssigned(clashId: string, assigneeId: string) {
    return this.enqueue({ userId: assigneeId, clashId, type: 'ASSIGNED' });
  }

  enqueueStatusChange(clashId: string, recipientIds: string[], oldLabel: string, newLabel: string) {
    const detail = `Status berubah dari ${oldLabel} menjadi ${newLabel}.`;
    return Promise.all(
      recipientIds.map((userId) => this.enqueue({ userId, clashId, type: 'STATUS_CHANGE', detail })),
    );
  }

  enqueueOverdue(clashId: string, assigneeId: string) {
    return this.enqueue({ userId: assigneeId, clashId, type: 'OVERDUE' });
  }
}
