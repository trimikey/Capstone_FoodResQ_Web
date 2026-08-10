/**
 * Debug: liệt kê bảng + enum + index có trong DB để biết migration đã chạy được đến đâu.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  console.log('=== TABLES ===');
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%dish_step%'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(tables, null, 2));

  console.log('\n=== ENUMS ===');
  const enums = await prisma.$queryRawUnsafe(`
    SELECT typname FROM pg_type
    WHERE typtype = 'e' AND typname LIKE '%dish_step%'
  `);
  console.log(JSON.stringify(enums, null, 2));

  console.log('\n=== INDEXES on campaign_dish_steps ===');
  try {
    const idx = await prisma.$queryRawUnsafe(`
      SELECT indexname FROM pg_indexes WHERE tablename = 'campaign_dish_steps'
    `);
    console.log(JSON.stringify(idx, null, 2));
  } catch (e) {
    console.log('(table does not exist yet)');
  }

  console.log('\n=== PRISMA MIGRATIONS ===');
  const mig = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5
  `);
  console.log(JSON.stringify(mig, null, 2));
})()
  .catch((e) => console.error('FAIL:', e.message))
  .finally(() => prisma.$disconnect());