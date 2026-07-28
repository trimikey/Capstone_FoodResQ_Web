import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Phân loại lỗi từ cron job: P1001 (DB không tới được) là transient → log warn,
 * lỗi khác → log error như cũ. Tránh spam error log khi Supabase pooler
 * chập chờn vài giây — lần quét sau sẽ tự bù.
 */
export function logCronError(logger: Logger, method: string, e: unknown): void {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P1001') {
    logger.warn(`${method} skipped — DB unreachable (${e.code}); sẽ thử lại lần quét sau`);
    return;
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    logger.warn(`${method} skipped — Prisma init error; sẽ thử lại lần quét sau`);
    return;
  }
  logger.error(`${method} failed`, e as Error);
}
