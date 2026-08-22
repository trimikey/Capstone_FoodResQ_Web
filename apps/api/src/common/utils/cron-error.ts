import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Phân loại lỗi từ cron job: P1001 (DB không tới được) là transient → log warn,
 * lỗi khác → log error như cũ. Tránh spam error log khi Supabase pooler
 * chập chờn vài giây — lần quét sau sẽ tự bù.
 */
export function logCronError(logger: Logger, method: string, e: unknown): void {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError
    && (e.code === 'P1001' || e.code === 'P2024' || e.code === 'P2028')
  ) {
    logger.warn(`${method} skipped — DB busy/unreachable (${e.code}); sẽ thử lại lần quét sau`);
    return;
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    logger.warn(`${method} skipped — Prisma init error; sẽ thử lại lần quét sau`);
    return;
  }
  logger.error(`${method} failed`, e as Error);
}

const runningCronMethods = new Set<string>();
const lastSkipLogAt = new Map<string, number>();
const DEFAULT_CRON_DB_CONCURRENCY = 3;
const DEFAULT_CRON_SKIP_LOG_COOLDOWN_MS = 5 * 60_000;

let runningCronDbJobs = 0;

function cronDbMaxConcurrency(): number {
  const configured = Number(process.env.CRON_DB_MAX_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return DEFAULT_CRON_DB_CONCURRENCY;
}

function cronSkipLogCooldownMs(): number {
  const configured = Number(process.env.CRON_SKIP_LOG_COOLDOWN_MS);
  if (Number.isInteger(configured) && configured >= 0) return configured;
  return DEFAULT_CRON_SKIP_LOG_COOLDOWN_MS;
}

function logCronSkip(logger: Logger, key: string, message: string, level: 'log' | 'warn' = 'warn') {
  const now = Date.now();
  const last = lastSkipLogAt.get(key) ?? 0;
  if (now - last < cronSkipLogCooldownMs()) return;
  lastSkipLogAt.set(key, now);
  logger[level](message);
}

/**
 * Supabase pooler dev URLs are small; overlapping cron jobs then fight regular
 * requests and each other. Cap DB-heavy cron concurrency in this process and
 * prevent the same method from overlapping itself. A skipped tick is safe
 * because all cron jobs here are idempotent and will run again.
 */
export async function runCronDbExclusive<T>(
  logger: Logger,
  method: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (runningCronMethods.has(method)) {
    logCronSkip(logger, `${method}:self`, `${method} skipped — previous tick is still running`);
    return undefined;
  }
  const maxConcurrency = cronDbMaxConcurrency();
  if (runningCronDbJobs >= maxConcurrency) {
    logCronSkip(
      logger,
      `${method}:pool`,
      `${method} skipped — DB cron concurrency is full (${runningCronDbJobs}/${maxConcurrency})`,
      'log',
    );
    return undefined;
  }
  runningCronMethods.add(method);
  runningCronDbJobs += 1;
  try {
    return await fn();
  } finally {
    runningCronDbJobs -= 1;
    runningCronMethods.delete(method);
  }
}
