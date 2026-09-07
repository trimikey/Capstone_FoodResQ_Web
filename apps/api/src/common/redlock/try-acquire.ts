import type { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type Redlock from 'redlock';

/**
 * Lấy khóa Redis BEST-EFFORT: Redis chưa ready → bỏ khóa ngay; acquire lỗi hoặc
 * treo quá 4s (connection flapping, Upstash nghẽn…) → cũng bỏ khóa, chỉ log.
 *
 * Chỉ dùng cho các luồng mà chốt đúng đắn thật sự nằm ở SQL (UPDATE có điều kiện
 * `quantity_remaining >= x`) — khóa chỉ để giảm va chạm, mất nó không mất an toàn.
 * Trước đây Redis rớt trên deploy là mọi đơn treo ở acquire rồi chết 409/503 oan.
 */
export async function tryAcquireLock(
  redlock: Redlock,
  redis: Redis | undefined,
  logger: Logger,
  lockKey: string,
  ttlMs: number,
): Promise<Awaited<ReturnType<Redlock['acquire']>> | null> {
  if (redis && redis.status !== 'ready') {
    logger.warn(`Redis chưa sẵn sàng (${redis.status}) — đi tiếp không khóa: ${lockKey}`);
    return null;
  }
  try {
    return await Promise.race([
      redlock.acquire([lockKey], ttlMs),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error('acquire treo quá 4s')), 4000);
        if (typeof t.unref === 'function') t.unref();
      }),
    ]);
  } catch (err: unknown) {
    logger.warn(
      `Không lấy được khóa ${lockKey} (${err instanceof Error ? err.message : String(err)}) — đi tiếp không khóa.`,
    );
    return null;
  }
}

/** Nhả khóa an toàn: release lỗi (connection rớt) không được phá response — khóa tự hết hạn theo TTL. */
export async function safeRelease(lock: { release(): unknown } | null): Promise<void> {
  if (lock) await Promise.resolve(lock.release()).catch(() => undefined);
}
