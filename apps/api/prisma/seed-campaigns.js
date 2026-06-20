/* eslint-disable */
// Seed chiến dịch bếp ăn cộng đồng (kitchen campaigns) để chef/waiter/shipper thấy task.
// Idempotent: bỏ qua nếu campaign cùng tiêu đề đã tồn tại.
// Chạy: node prisma/seed-campaigns.js
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const CHARITY = {
  email: 'beptuthien@foodresq.vn',
  fullName: 'Bếp Ăn Từ Thiện Sài Gòn',
  orgName: 'Bếp Ăn Từ Thiện Sài Gòn',
};

// Lịch các ngày tới — toạ độ rải HCM (gồm Long Bình/Thủ Đức gần người dùng)
function campaignsFor(now) {
  const day = (n) => {
    const d = new Date(now.getTime() + n * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  return [
    { title: 'Nấu 200 suất cơm cho bệnh viện Q.Thủ Đức', address: 'Nguyễn Xiển, Long Bình, TP. Thủ Đức', lat: 10.852, lng: 106.84, date: day(1), start: '07:00', end: '11:00', chef: 4, waiter: 5, shipper: 3, servings: 200 },
    { title: 'Bếp 0 đồng cuối tuần — Vinhomes Grand Park', address: 'Vinhomes Grand Park, TP. Thủ Đức', lat: 10.843, lng: 106.844, date: day(2), start: '08:00', end: '12:00', chef: 3, waiter: 4, shipper: 2, servings: 150 },
    { title: 'Phát cháo đêm cho người vô gia cư Q.1', address: 'Phạm Ngũ Lão, Quận 1, TP.HCM', lat: 10.7679, lng: 106.6925, date: day(3), start: '19:00', end: '22:00', chef: 2, waiter: 3, shipper: 4, servings: 120 },
    { title: 'Nấu ăn cho mái ấm trẻ em Gò Vấp', address: 'Quang Trung, Gò Vấp, TP.HCM', lat: 10.838, lng: 106.665, date: day(5), start: '09:00', end: '13:00', chef: 3, waiter: 2, shipper: 2, servings: 100 },
  ];
}

async function main() {
  const passwordHash = await bcrypt.hash('Provider123', 12);

  // Charity (receiver có cờ tổ chức từ thiện)
  const user = await prisma.user.upsert({
    where: { email: CHARITY.email },
    update: { fullName: CHARITY.fullName, status: 'active' },
    create: { email: CHARITY.email, passwordHash, fullName: CHARITY.fullName, role: 'receiver', status: 'active' },
  });
  let receiver = await prisma.receiverProfile.findUnique({ where: { userId: user.id } });
  if (!receiver) {
    receiver = await prisma.receiverProfile.create({
      data: { userId: user.id, isCharityOrg: true, organizationName: CHARITY.orgName, verificationStatus: 'approved' },
    });
  } else {
    await prisma.receiverProfile.update({ where: { id: receiver.id }, data: { isCharityOrg: true, organizationName: CHARITY.orgName } });
  }
  console.log('✓ charity:', CHARITY.orgName);

  let created = 0;
  for (const c of campaignsFor(new Date())) {
    const dup = await prisma.kitchenCampaign.findFirst({ where: { charityReceiverId: receiver.id, title: c.title }, select: { id: true } });
    if (dup) {
      // làm mới ngày + mở lại để luôn còn hạn
      await prisma.$executeRaw(Prisma.sql`
        UPDATE kitchen_campaigns SET scheduled_date=${c.date}::date, status='open'::campaign_status, updated_at=NOW() WHERE id=${dup.id}::uuid`);
      console.log('  ↻ refresh:', c.title);
      continue;
    }
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO kitchen_campaigns (
        charity_receiver_id, title, kitchen_address, kitchen_location,
        scheduled_date, start_time, end_time,
        chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
        expected_servings, status, created_at, updated_at
      ) VALUES (
        ${receiver.id}::uuid, ${c.title}, ${c.address},
        ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
        ${c.date}::date, ${c.start}, ${c.end},
        ${c.chef}, ${c.waiter}, ${c.shipper}, ${c.servings},
        'open'::campaign_status, NOW(), NOW())`);
    created++;
    console.log('  · campaign:', c.title);
  }
  console.log(`\nDone. ${created} campaign mới. Charity login: ${CHARITY.email} / Provider123`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
