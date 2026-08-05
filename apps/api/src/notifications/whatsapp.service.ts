import { Injectable, Logger } from '@nestjs/common';

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

export interface WhatsAppProvider {
  send(to: string, message: string): Promise<void>;
}

/**
 * Stands in for a real WhatsApp Business API integration (e.g. Meta Cloud
 * API) until one is wired up. Swap the WHATSAPP_PROVIDER binding in
 * NotificationsModule for a real WhatsAppProvider implementation later —
 * NotificationsProcessor only depends on the interface, not this class.
 */
@Injectable()
export class MockWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  send(to: string, message: string): Promise<void> {
    this.logger.log(`[MOCK WhatsApp] to ${to}: ${message}`);
    return Promise.resolve();
  }
}
