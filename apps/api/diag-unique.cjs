/* Read-only: liệt kê UNIQUE constraint của campaign_volunteer_assignments. */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.$queryRawUnsafe(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'campaign_volunteer_assignments'::regclass AND c.contype = 'u'
    ORDER BY c.conname
  `);
  console.table(rows);
  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); process.exit(1); });
