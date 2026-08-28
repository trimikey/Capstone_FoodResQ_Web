/*
 * Dồn mọi ảnh còn trỏ /uploads/... (đĩa máy dev) lên Cloudinary rồi cập nhật DB.
 *
 * Vì sao: DB là cloud dùng chung nhưng ./uploads là ổ đĩa từng máy — URL kiểu
 * http://192.168.x.x:3001/uploads/... hay /uploads/... đều chết trên deploy
 * (mixed content + timeout). Quy tắc dự án: mọi ảnh phải nằm trên Cloudinary.
 *
 * Cách chạy (từ apps/api):
 *   node prisma/migrate-uploads-to-cloudinary.cjs           # chạy thật
 *   DRY=1 node prisma/migrate-uploads-to-cloudinary.cjs     # chỉ liệt kê, không sửa gì
 *
 * Nguồn bytes cho từng ảnh, theo thứ tự:
 *   1. File local ./uploads/<đường-dẫn-sau-/uploads/>
 *   2. Tải HTTP từ chính URL gốc (nếu host đó còn sống trên mạng hiện tại)
 *   3. Bó tay → liệt kê vào danh sách MISSING, giữ nguyên DB
 */
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ── env: PrismaClient tự đọc DATABASE_URL, còn CLOUDINARY_* tự parse .env ─────
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const BASE_FOLDER = process.env.CLOUDINARY_FOLDER || 'foodresq';
if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('Thiếu CLOUDINARY_* trong .env — dừng.');
  process.exit(1);
}

const DRY = process.env.DRY === '1';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const prisma = new PrismaClient();

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
};

/** '/uploads/listings/a.jpg' hoặc 'http://x:3001/uploads/listings/a.jpg' → 'listings/a.jpg' */
function relOf(value) {
  const i = value.indexOf('/uploads/');
  if (i === -1) return null;
  // Cắt query string nếu có
  return value.slice(i + '/uploads/'.length).split('?')[0];
}

async function bytesFor(value, rel) {
  const local = path.join(UPLOADS_DIR, rel);
  if (fs.existsSync(local)) return { buf: fs.readFileSync(local), src: 'local' };
  if (value.startsWith('http')) {
    try {
      const res = await fetch(value, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), src: 'http' };
    } catch { /* host chết — rơi xuống missing */ }
  }
  return null;
}

async function uploadToCloudinary(buf, rel) {
  const subdir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const folder = subdir ? `${BASE_FOLDER}/${subdir}` : BASE_FOLDER;
  const timestamp = Math.floor(Date.now() / 1000);
  // Chữ ký = SHA1 các param theo alphabet (folder < timestamp) + secret — same StorageService
  const signature = createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${API_SECRET}`)
    .digest('hex');
  const ext = path.extname(rel).toLowerCase();
  const form = new FormData();
  form.append('file', new Blob([buf], { type: MIME_BY_EXT[ext] || 'image/jpeg' }));
  form.append('api_key', API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST', body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.secure_url) throw new Error('Cloudinary không trả secure_url');
  return json.secure_url;
}

async function main() {
  // ── 1. Tìm mọi cột text + json có tên giống cột ảnh ─────────────────────────
  const textCols = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying')
      AND column_name ~ '(url|photo|image|proof|selfie|avatar|cert)'
  `);
  const jsonCols = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('json', 'jsonb')
      AND column_name ~ '(url|photo|image)'
  `);

  const urlMap = new Map(); // giá-trị-cũ → secure_url (cache: 1 URL dùng nhiều nơi)
  const missing = new Map(); // giá-trị-cũ → [table.column × n]
  let cellsFixed = 0;

  async function resolve(value) {
    if (urlMap.has(value)) return urlMap.get(value);
    const rel = relOf(value);
    if (!rel) return null;
    const got = await bytesFor(value, rel);
    if (!got) return undefined; // missing
    if (DRY) {
      urlMap.set(value, `(DRY:${got.src})`);
      return `(DRY:${got.src})`;
    }
    const secure = await uploadToCloudinary(got.buf, rel);
    urlMap.set(value, secure);
    console.log(`  ↑ [${got.src}] ${rel} → ${secure}`);
    return secure;
  }

  // ── 2. Cột text ─────────────────────────────────────────────────────────────
  for (const c of textCols) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, "${c.column_name}" AS val FROM "${c.table_name}"
       WHERE "${c.column_name}" LIKE '%/uploads/%'`,
    ).catch(() => []); // bảng không có cột id (bảng nối) → bỏ qua, không có bảng ảnh nào như vậy
    if (rows.length) console.log(`\n${c.table_name}.${c.column_name}: ${rows.length} dòng`);
    for (const r of rows) {
      const secure = await resolve(r.val);
      if (secure === undefined) {
        missing.set(r.val, [...(missing.get(r.val) ?? []), `${c.table_name}.${c.column_name}`]);
        continue;
      }
      if (secure && !DRY) {
        await prisma.$executeRawUnsafe(
          `UPDATE "${c.table_name}" SET "${c.column_name}" = $1 WHERE id = $2::uuid`, secure, r.id,
        );
        cellsFixed++;
      } else if (secure && DRY) cellsFixed++;
    }
  }

  // ── 3. Cột json (mảng image_urls) ──────────────────────────────────────────
  for (const c of jsonCols) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, "${c.column_name}" AS val FROM "${c.table_name}"
       WHERE "${c.column_name}"::text LIKE '%/uploads/%'`,
    ).catch(() => []);
    if (rows.length) console.log(`\n${c.table_name}.${c.column_name} (json): ${rows.length} dòng`);
    for (const r of rows) {
      const arr = Array.isArray(r.val) ? r.val : [];
      let changed = false;
      let anyMissing = false;
      const next = [];
      for (const item of arr) {
        if (typeof item === 'string' && item.includes('/uploads/')) {
          const secure = await resolve(item);
          if (secure === undefined) {
            missing.set(item, [...(missing.get(item) ?? []), `${c.table_name}.${c.column_name}`]);
            anyMissing = true;
            next.push(item); // giữ nguyên phần tử chưa cứu được
            continue;
          }
          next.push(secure);
          changed = true;
        } else next.push(item);
      }
      if (changed && !DRY) {
        await prisma.$executeRawUnsafe(
          `UPDATE "${c.table_name}" SET "${c.column_name}" = $1::jsonb WHERE id = $2::uuid`,
          JSON.stringify(next), r.id,
        );
        cellsFixed++;
      } else if (changed && DRY) cellsFixed++;
      if (anyMissing) console.log(`  ! ${c.table_name} id=${r.id}: còn phần tử chưa cứu được`);
    }
  }

  // ── 4. Tổng kết ─────────────────────────────────────────────────────────────
  console.log(`\n===== ${DRY ? 'DRY-RUN' : 'HOÀN TẤT'} =====`);
  console.log(`Ảnh đã ${DRY ? 'sẽ' : ''} upload: ${urlMap.size} · ô DB ${DRY ? 'sẽ' : 'đã'} sửa: ${cellsFixed}`);
  if (missing.size) {
    console.log(`\nKHÔNG CỨU ĐƯỢC ${missing.size} ảnh (không có file local, host gốc không phản hồi):`);
    for (const [val, places] of missing) console.log(`  - ${val}  (${[...new Set(places)].join(', ')})`);
    console.log('→ Các ảnh này cần đăng lại từ app, hoặc chạy lại script trên đúng máy giữ file.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
