import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: config.get<number>('SMTP_PORT') ?? 1025,
      secure: config.get<boolean>('SMTP_SECURE') ?? false,
      // Omitted entirely (not just left undefined) when unset — matches
      // MailHog's dev sandbox, which rejects an AUTH attempt it never asked
      // for. env.validation.ts requires SMTP_USER/PASS whenever
      // NODE_ENV=production, so a real deploy can't end up here without them.
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    this.from = config.get<string>('SMTP_FROM') ?? 'EPS Workspace <noreply@clashhub.dev>';
  }

  async sendClashNotification(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }
}
