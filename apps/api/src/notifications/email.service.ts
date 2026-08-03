import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    // No auth: matches MailHog's dev sandbox. A real SMTP provider would add
    // `auth: { user, pass }` here from env vars.
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: config.get<number>('SMTP_PORT') ?? 1025,
      secure: false,
    });
    this.from = config.get<string>('SMTP_FROM') ?? 'ClashHub <noreply@clashhub.dev>';
  }

  async sendClashNotification(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }
}
