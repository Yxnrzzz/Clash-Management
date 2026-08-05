export const NOTIFICATIONS_QUEUE = 'notifications';

export type NotificationJobType = 'ASSIGNED' | 'STATUS_CHANGE' | 'OVERDUE';

export interface NotificationJobData {
  userId: string;
  clashId: string;
  type: NotificationJobType;
  /** Extra context for the message body, e.g. "Open -> In Progress". */
  detail?: string;
}
