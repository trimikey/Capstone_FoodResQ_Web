require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const menuItems = await p.campaignMenuItem.findMany({
    where: { campaignId: '525b79c3-83a9-4cf4-b3d0-1a97016f2f1e' },
    select: { id: true, customName: true, sortOrder: true },
  });
  console.log('Menu items hiện tại:');
  console.table(menuItems);

  await p.$disconnect();
})().catch(async (e) => { console.error(e.message); await p.$disconnect(); });
