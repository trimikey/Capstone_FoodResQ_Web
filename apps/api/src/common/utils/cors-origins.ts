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

const PROJECT_ORIGIN_PATTERNS = [
  'https://capstonefoodresqweb*.vercel.app',
  'https://capstone-food-res-q-web-web*.vercel.app',
];

function isPrivateNetworkHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '10.0.2.2' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function isAllowedDevOrigin(origin: string): boolean {
  if (process.env['NODE_ENV'] === 'production') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && isPrivateNetworkHost(parsed.hostname);
  } catch {
    return false;
  }
}

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
  const configured = [...base, ...PROJECT_ORIGIN_PATTERNS];
  if (process.env['NODE_ENV'] === 'production') return Array.from(new Set(configured));
  return Array.from(new Set([...configured, ...DEV_MOBILE_ORIGINS]));
}

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
  if (allowedOrigins().some((entry) => originMatches(entry, incoming)) || isAllowedDevOrigin(incoming)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin không được phép bởi CORS: ${origin}`));
}
