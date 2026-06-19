import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Gửi email. Nếu chưa cấu hình SMTP (SMTP_HOST...), rơi về chế độ DEV:
 * chỉ log nội dung ra console (đủ để test luồng OTP mà không cần SMTP thật).
 * Cấu hình thật qua env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        secure: Number(this.config.get('SMTP_PORT') ?? 587) === 465,
        auth: {
          user: this.config.getOrThrow<string>('SMTP_USER'),
          pass: this.config.getOrThrow<string>('SMTP_PASS'),
        },
      });
    } else {
      this.logger.warn(
        'SMTP chưa cấu hình — email sẽ chỉ được LOG ra console (chế độ dev).',
      );
    }
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const subject = 'FoodResQ — Mã đặt lại mật khẩu';
    const text = `Mã OTP đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`;

    if (!this.transporter) {
      // Dev fallback: log OTP để test (KHÔNG dùng ở production)
      this.logger.log(`[DEV MAIL] to=${to} | OTP=${otp}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get<string>('MAIL_FROM') ?? 'FoodResQ <no-reply@foodresq.com>',
      to,
      subject,
      text,
    });
  }
}
