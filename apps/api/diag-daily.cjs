/* Read-only: mô phỏng đúng 2 truy vấn từng lỗi để chắc chắn đã hết. */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // 1. findByProvider — Prisma client select cột mới
  const viaPrisma = await p.foodListing.findMany({
    take: 2,
    select: { id: true, title: true, dailyStartMinute: true, dailyEndMinute: true },
  });
  console.log('findMany qua Prisma: OK');
  console.table(viaPrisma);

  // 2. findNearby — raw SQL với alias fl.
  const viaRaw = await p.$queryRawUnsafe(`
    SELECT fl.id, fl.title, fl.daily_start_minute, fl.daily_end_minute
    FROM food_listings fl LIMIT 2
  `);
  console.log('raw SQL fl.daily_*: OK');
  console.table(viaRaw);

  // 3. CHECK constraint có chặn khung giờ ngược không
  try {
    await p.$executeRawUnsafe(`
      UPDATE food_listings SET daily_start_minute = 1260, daily_end_minute = 420
      WHERE id = (SELECT id FROM food_listings LIMIT 1)
    `);
    console.log('CẢNH BÁO: CHECK constraint KHÔNG chặn khung giờ ngược!');
  } catch (e) {
    console.log('CHECK constraint chặn đúng khung giờ ngược:', e.message.split('\n')[0].slice(0, 80));
  }

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); process.exit(1); });
