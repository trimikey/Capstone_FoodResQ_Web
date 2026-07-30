/* Apply only the newest migration (idempotent) */
require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const MIGRATIONS_DIR = path.resolve(__dirname, '../apps/api/prisma/migrations');
const TARGET = process.argv[2] || '20260728000000_add_campaign_provider_pickup_time';

function splitStatements(sql) {
  const noComments = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  const dollarBlocks = [];
  let masked = noComments.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    dollarBlocks.push(m);
    return `__DOLLAR_${dollarBlocks.length - 1}__`;
  });
  const parts = masked.split(/;\s*(?:\r?\n|$)/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => p.replace(/__DOLLAR_(\d+)__/g, (_, i) => dollarBlocks[Number(i)]));
}

async function main() {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, TARGET, 'migration.sql'), 'utf8');
  const stmts = splitStatements(sql);
  console.log(`[${TARGET}] ${stmts.length} statements`);
  for (const [i, s] of stmts.entries()) {
    try {
      await prisma.$executeRawUnsafe(s);
      console.log(`  ${i + 1} OK`);
    } catch (e) {
      const msg = String(e.message || e);
      console.log(`  ${i + 1} skip/err: ${msg.split('\n')[0].trim()}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
