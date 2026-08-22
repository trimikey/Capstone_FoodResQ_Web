import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Lỗi KẾT NỐI thoáng qua — dev local nối Supabase pooler + Upstash qua mạng
 * gia đình nên chuyện đứt vài giây (Wi-Fi giật, máy sleep/wake, pooler thu hồi
 * connection idle) xảy ra thường xuyên. Không retry thì mỗi cú giật là một
 * loạt request đổ lỗi P1017/ECONNRESET cho người dùng dù DB vẫn khoẻ.
 *
 *  - P1001: không với tới DB server (chắc chắn query CHƯA chạy — retry an toàn).
 *  - P1002: với tới nhưng timeout lúc bắt tay.
 *  - P1017: server chủ động đóng connection (thường là pooler recycle).
 */
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1017']);
const TRANSIENT_MESSAGES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'socket hang up',
  'Server has closed the connection',
  "Can't reach database server",
];

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

function isTransientConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(err.code)) {
    return true;
  }
  // Engine rớt kết nối lúc khởi tạo lại cũng thuộc nhóm này.
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_MESSAGES.some((needle) => message.includes(needle));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * PrismaClient + tự retry (tối đa 2 lần, backoff 300/600ms) khi gặp lỗi kết nối
 * thoáng qua. Lỗi nghiệp vụ (unique, not found, validation…) KHÔNG bị retry.
 *
 * Đánh đổi có chủ đích: với P1017/ECONNRESET, một lệnh GHI có xác suất rất nhỏ
 * đã commit xong trước khi đứt — retry sẽ chạy lại lệnh đó. Chấp nhận được vì
 * các lệnh ghi của app phần lớn idempotent (update theo id, upsert, create có
 * unique constraint chặn trùng); đổi lại toàn bộ app sống sót qua các cú giật
 * mạng thay vì đổ lỗi cho người dùng.
 *
 * Lưu ý kỹ thuật: constructor TRẢ VỀ client đã `$extends` (proxy) — mọi nơi
 * inject PrismaService đều nhận bản có retry mà không phải đổi call site nào.
 * Lifecycle hook được gắn tay lên proxy vì method của class không nằm trên nó.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Timeout mặc định của interactive transaction là 5s — quá sát khi DB ở
      // Singapore và mỗi query là một round-trip qua WAN: transaction 4-5 query
      // (vd cron advanceRecruitmentLifecycle) chỉ cần mạng chậm nhẹ là vượt hạn
      // vài trăm ms và chết P2028. Nới lên 20s (kèm 10s chờ lấy connection);
      // transaction của app đều ngắn về số lệnh nên không lo giữ lock lâu.
      transactionOptions: {
        maxWait: 10_000,
        timeout: 20_000,
      },
    });
    const logger = new Logger(PrismaService.name);

    const extended = this.$extends({
      query: {
        $allOperations: async ({ model, operation, args, query }) => {
          let attempt = 0;
          for (;;) {
            try {
              return await query(args);
            } catch (err) {
              if (attempt >= MAX_RETRIES || !isTransientConnectionError(err)) throw err;
              attempt += 1;
              const label = model ? `${model}.${operation}` : operation;
              const reason = err instanceof Error ? err.message.split('\n').pop()?.trim() : String(err);
              logger.warn(
                `Mất kết nối DB thoáng qua khi chạy ${label} (${reason}) — thử lại lần ${attempt}/${MAX_RETRIES}.`,
              );
              await sleep(RETRY_BASE_DELAY_MS * attempt);
            }
          }
        },
      },
    }) as unknown as PrismaService & { $connect(): Promise<void>; $disconnect(): Promise<void> };

    // Proxy từ $extends không mang method của class → gắn lifecycle hook trực tiếp
    // để Nest vẫn connect lúc boot và disconnect lúc shutdown.
    extended.onModuleInit = async () => {
      await extended.$connect();
    };
    extended.onModuleDestroy = async () => {
      await extended.$disconnect();
    };

    return extended;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
