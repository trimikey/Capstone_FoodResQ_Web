require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function nowVnMinutes() {
  const now = new Date();
  const vnHour = (now.getUTCHours() + 7) % 24;
  return vnHour * 60 + now.getUTCMinutes();
}
function vnHhmmToTotalMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

(async () => {
  const now = nowVnMinutes();
  const nowH = Math.floor(now / 60), nowM = now % 60;
  console.log(`🕐 nowVnMinutes() = ${now} (${String(nowH).padStart(2,'0')}:${String(nowM).padStart(2,'0')} VN)`);

  // Simulate cron logic
  const todayVn = new Date();
  const vnYear = todayVn.getUTCFullYear();
  const vnMonth = todayVn.getUTCMonth();
  const vnDay = todayVn.getUTCDate();
  const todayVnStart = new Date(Date.UTC(vnYear, vnMonth, vnDay));
  const endOfDayUtc = new Date(todayVnStart.getTime() + 86_400_000);
  console.log(`📅 todayVnStart = ${todayVnStart.toISOString()}`);
  console.log(`📅 endOfDayUtc  = ${endOfDayUtc.toISOString()}`);

  const campaigns = await p.kitchenCampaign.findMany({
    where: { status: { in: ['in_progress', 'open'] }, scheduledDate: { gte: todayVnStart, lt: endOfDayUtc } },
    select: { id: true, title: true, scheduledDate: true },
  });
  console.log(`\n📋 Campaigns found: ${campaigns.length}`);
  campaigns.forEach((c) => console.log(`   ${c.id} | ${c.title} | scheduledDate=${c.scheduledDate.toISOString()}`));

  if (campaigns.length === 0) {
    // Thử không lọc theo ngày
    const all = await p.kitchenCampaign.findMany({
      where: { status: { in: ['in_progress', 'open'] } },
      select: { id: true, title: true, scheduledDate: true },
    });
    console.log(`\n⚠ Không tìm thấy campaign nào trong ngày. Tất cả:`);
    all.forEach((c) => console.log(`   ${c.id} | ${c.title} | ${c.scheduledDate.toISOString()}`));
  }

  const cid = 'a57d007b-ce12-410f-b4fa-529f95dd32cd';
  const steps = await p.campaignDishStep.findMany({
    where: { campaignId: cid, status: { in: ['locked', 'available'] } },
    include: { menuItem: { select: { customName: true } } },
    orderBy: [{ stepOrder: 'asc' }],
  });
  console.log(`\n📋 Dish steps của campaign mới:`);
  steps.forEach((s) => {
    const st = vnHhmmToTotalMinutes(s.scheduledTime);
    const onTime = now >= st;
    console.log(`   ${s.menuItem.customName.padEnd(22)} | ${s.stepName.padEnd(22)} | ${s.scheduledTime} | ${s.status} | now>=scheduled=${onTime}`);
  });

  // Simulate what cron would do
  if (steps.length > 0) {
    const toOpen = steps.filter((s) => {
      const st = vnHhmmToTotalMinutes(s.scheduledTime);
      return s.status === 'locked' && now >= st;
    });
    console.log(`\n🔓 Cron sẽ unlock: ${toOpen.length} steps`);
    if (toOpen.length > 0) {
      await p.campaignDishStep.updateMany({
        where: { id: { in: toOpen.map((x) => x.id) } },
        data: { status: 'available', openedAt: new Date() },
      });
      console.log(`✅ Đã unlock! F5 trang để thấy.`);
    }
  }

  await p.$disconnect();
})().catch(async (e) => { console.error('❌', e.message); await p.$disconnect(); });
