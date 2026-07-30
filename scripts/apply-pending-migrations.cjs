/* eslint-disable no-console */
/**
 * Apply pending Prisma migrations idempotently.
 *
 * Cách hoạt động:
 *  - Đọc tất cả file SQL trong apps/api/prisma/migrations/<name>/migration.sql
 *  - Chạy từng statement một qua $executeRawUnsafe (tránh lỗi
 *    "cannot insert multiple commands into a prepared statement").
 *  - Migration này chứa IF NOT EXISTS / DO $$ BEGIN ... END $$ → chạy nhiều lần OK.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const MIGRATIONS_DIR = path.resolve(__dirname, '../apps/api/prisma/migrations');

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function readSql(dirName) {
  const p = path.join(MIGRATIONS_DIR, dirName, 'migration.sql');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

/**
 * Tách SQL đơn giản — không xử lý function body đầy đủ.
 * Heuristic: statements cách nhau bởi `;` ở cuối dòng. Bỏ qua comment lines.
 * Các statement DO $$ ... $$; được giữ nguyên.
 */
function splitStatements(sql) {
  const noComments = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  // Thay $$ ... $$ bằng placeholder tạm để split
  const dollarBlocks = [];
  let masked = noComments.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    dollarBlocks.push(m);
    return `__DOLLAR_${dollarBlocks.length - 1}__`;
  });
  const parts = masked.split(/;\s*(?:\r?\n|$)/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => {
    return p.replace(/__DOLLAR_(\d+)__/g, (_, i) => dollarBlocks[Number(i)]);
  });
}

async function applyOne(dirName) {
  const sql = readSql(dirName);
  if (!sql) {
    console.log(`[${dirName}] no migration.sql, skip`);
    return;
  }
  const stmts = splitStatements(sql);
  console.log(`[${dirName}] ${stmts.length} statements`);
  for (const s of stmts) {
    try {
      await prisma.$executeRawUnsafe(s);
    } catch (err) {
      const msg = String(err.message || err);
      // Nếu đã tồn tại (idempotent) → bỏ qua
      if (/already exists|duplicate|does not exist/i.test(msg)) {
        console.log(`  · skip (${msg.split('\n')[0].trim()})`);
        continue;
      }
      console.error(`  · FAIL: ${msg.split('\n')[0].trim()}`);
      throw err;
    }
  }
  console.log(`[${dirName}] OK`);
}

async function main() {
  const dirs = listMigrations();
  console.log(`Found ${dirs.length} migration(s)`);
  for (const d of dirs) {
    await applyOne(d);
  }
  await prisma.$disconnect();
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
