/**
 * Verify seed data.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.campaignDishStep.findMany({
    where: { campaign: { title: { contains: 'DEMO' } } },
    orderBy: [{ menuItem: { customName: 'asc' } }, { stepOrder: 'asc' }],
    include: {
      menuItem: { select: { customName: true } },
      campaign: { select: { title: true, scheduledDate: true } },
    },
  });
  console.log(`Total: ${rows.length} bản ghi\n`);
  for (const r of rows) {
    console.log(
      `  ${r.menuItem.customName.padEnd(30)} | khâu ${r.stepOrder} (${r.stepName.padEnd(10)}) | ${r.scheduledTime} | ${r.status}`,
    );
  }
})()
  .catch((e) => console.error('FAIL:', e.message))
  .finally(() => prisma.$disconnect());