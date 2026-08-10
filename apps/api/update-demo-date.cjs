require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const CAMPAIGN_ID = '525b79c3-83a9-4cf4-b3d0-1a97016f2f1e';

(async () => {
  const c = await p.kitchenCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { title: true, scheduledDate: true, endDate: true, status: true, startTime: true, endTime: true },
  });
  console.log('Trước:', JSON.stringify(c, null, 2));

  // Đặt về hôm nay (VN date → UTC midnight)
  const nowVN = new Date(Date.now() + 7 * 3600_000);
  const today = new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()));

  await p.kitchenCampaign.update({
    where: { id: CAMPAIGN_ID },
    data: {
      scheduledDate: today,
      endDate: today,
      status: 'in_progress',
    },
  });

  const c2 = await p.kitchenCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { title: true, scheduledDate: true, endDate: true, status: true },
  });
  console.log('Sau:', JSON.stringify(c2, null, 2));
  console.log('✅ Đã cập nhật về hôm nay');

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); });
