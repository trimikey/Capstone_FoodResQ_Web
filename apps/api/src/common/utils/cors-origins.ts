/**
 * Whitelist origin dùng chung cho HTTP (main.ts) và WebSocket (notifications.gateway.ts).
 *
 * Trước đây mỗi nơi tự viết `process.env['ALLOWED_ORIGINS']?.split(',') ?? [...]`, dễ lệch
 * nhau khi thêm domain. Gom về một chỗ để REST và socket luôn cho phép đúng cùng một tập.
 *
 * CLAUDE.md §6: whitelist origin tường minh, KHÔNG dùng wildcard ở production.
 */

const DEFAULT_ORIGINS = ['http://localhost:3000'];

/**
 * Domain của CHÍNH project FE này — luôn được phép, không phụ thuộc env trên Render.
 *
 * Vercel đổi domain theo tên project/preview (`capstone-food-res-q-web-web`,
 * `capstonefoodresqweb`, `...-git-master-abc`); mỗi lần đổi mà phải vào Render sửa
 * `ALLOWED_ORIGINS` rồi chờ redeploy thì đăng nhập gãy trong lúc đó — đúng lỗi CORS
 * gặp ngày 12/09/2026. Đây vẫn là whitelist tường minh theo TÊN PROJECT, không phải
 * mở `*` cho mọi site.
 */
const PROJECT_ORIGIN_PATTERNS = [
  'https://capstonefoodresqweb*.vercel.app',
  'https://capstone-food-res-q-web-web*.vercel.app',
];

/** Bỏ nháy, khoảng trắng và dấu `/` cuối — env dán từ dashboard hay lẫn mấy thứ này. */
function normalizeOrigin(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
}

/** Danh sách origin được phép, đọc từ env `ALLOWED_ORIGINS` (ngăn cách bởi dấu phẩy). */
export function allowedOrigins(): string[] {
  const raw = process.env['ALLOWED_ORIGINS'];
  const fromEnv = (raw ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const base = fromEnv.length > 0 ? fromEnv : DEFAULT_ORIGINS;
  return [...new Set([...base, ...PROJECT_ORIGIN_PATTERNS])];
}

/**
 * Một entry được phép chứa `*` ở phần host để bao các domain/preview của cùng một
 * project Vercel — VD `https://capstonefoodresqweb*.vercel.app` khớp
 * `https://capstonefoodresqweb-git-master-abc.vercel.app`. `*` chỉ khớp ký tự hợp lệ
 * của hostname (`[a-z0-9-]`) nên không thể nhảy sang domain khác.
 */
export function originMatches(entry: string, origin: string): boolean {
  if (!entry.includes('*')) return entry === origin;
  const pattern = entry
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[a-z0-9-]*');
  return new RegExp(`^${pattern}$`, 'i').test(origin);
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
  if (!origin) {
    callback(null, true);
    return;
  }
  const incoming = normalizeOrigin(origin);
  if (allowedOrigins().some((entry) => originMatches(entry, incoming))) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin không được phép bởi CORS: ${origin}`));
}
