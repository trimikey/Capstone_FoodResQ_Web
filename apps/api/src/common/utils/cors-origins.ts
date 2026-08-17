/**
 * Whitelist origin dùng chung cho HTTP (main.ts) và WebSocket (notifications.gateway.ts).
 *
 * Trước đây mỗi nơi tự viết `process.env['ALLOWED_ORIGINS']?.split(',') ?? [...]`, dễ lệch
 * nhau khi thêm domain. Gom về một chỗ để REST và socket luôn cho phép đúng cùng một tập.
 *
 * CLAUDE.md §6: whitelist origin tường minh, KHÔNG dùng wildcard ở production.
 */

const DEFAULT_ORIGINS = ['http://localhost:3000'];
const DEV_MOBILE_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://10.0.2.2:8081',
  'http://10.0.2.2:3001',
];

/** Danh sách origin được phép, đọc từ env `ALLOWED_ORIGINS` (ngăn cách bởi dấu phẩy). */
export function allowedOrigins(): string[] {
  const raw = process.env['ALLOWED_ORIGINS'];
  if (!raw) return DEFAULT_ORIGINS;
  const list = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const configured = list.length > 0 ? list : DEFAULT_ORIGINS;
  if (process.env['NODE_ENV'] === 'production') return configured;
  return Array.from(new Set([...configured, ...DEV_MOBILE_ORIGINS]));
}

/**
 * Delegate theo đúng chữ ký của `cors` (Express) và `socket.io` — cả hai nhận
 * `(origin, callback)`.
 *
 * `origin` là `undefined` với request không đi qua trình duyệt (curl, health check,
 * server-to-server) — những request đó không có khái niệm same-origin nên cho qua,
 * chặn chúng chỉ làm hỏng monitoring chứ không thêm bảo mật.
 */
export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin || allowedOrigins().includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin không được phép bởi CORS: ${origin}`));
}
