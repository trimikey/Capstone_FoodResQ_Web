/*
 * Đưa chef2 vào chiến dịch demo đang chạy để xem trọn luồng đầu bếp.
 *
 * Nhận HAI ca NỐI TIẾP (06–09 sơ chế, 09–12 nấu chính) — đúng luật multi-shift:
 * được nhiều ca miễn không trùng giờ. Ca sáng để `assigned` (chưa điểm danh) nên
 * chef2 tự đi hết: Nhận việc → Điểm danh → Đang nấu → Hoàn thành.
 *
 * CHỈ THÊM, không sửa/xoá bản ghi của người khác. Chạy lại thì bỏ qua ca đã có.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CAMPAIGN_ID = '525b79c3-83a9-4cf4-b3d0-1a97016f2f1e';
const CHEF_EMAIL = 'chef2@gmail.com';
const SHIFT_LABELS = ['Ca sáng — Sơ chế', 'Ca trưa — Nấu chính'];

(async () => {
  const vol = await prisma.volunteerProfile.findFirst({
    where: { user: { email: CHEF_EMAIL } },
    select: { id: true, user: { select: { fullName: true, status: true } } },
  });
  if (!vol) throw new Error(`Không tìm thấy TNV ${CHEF_EMAIL}`);
  if (vol.user.status !== 'active') throw new Error(`Tài khoản đang ở trạng thái ${vol.user.status}`);

  const campaign = await prisma.kitchenCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { id: true, title: true, status: true },
  });
  if (!campaign) throw new Error('Không tìm thấy chiến dịch demo');
  if (campaign.status !== 'in_progress') {
    console.log(`⚠ Chiến dịch đang ở trạng thái "${campaign.status}" — TNV sẽ không cập nhật được công việc.`);
  }

  const shifts = await prisma.campaignShift.findMany({
    where: { campaignId: CAMPAIGN_ID, label: { in: SHIFT_LABELS } },
    orderBy: { startTime: 'asc' },
  });

  for (const shift of shifts) {
    const existed = await prisma.campaignVolunteerAssignment.findFirst({
      where: { campaignId: CAMPAIGN_ID, volunteerId: vol.id, shiftId: shift.id },
      select: { id: true, status: true },
    });
    if (existed) {
      console.log(`— đã có: ${shift.label} (${existed.status})`);
      continue;
    }

    // `assigned` = đã được tổ chức duyệt, chưa điểm danh — đúng điểm bắt đầu của luồng.
    await prisma.campaignVolunteerAssignment.create({
      data: {
        campaignId: CAMPAIGN_ID,
        volunteerId: vol.id,
        shiftId: shift.id,
        role: 'chef',
        status: 'assigned',
      },
    });
    await prisma.campaignShift.update({
      where: { id: shift.id },
      data: { slotsFilled: { increment: 1 } },
    });
    console.log(`✓ thêm: ${shift.label} · ${shift.startTime}–${shift.endTime}`);
  }

  // chef_slots_filled đếm SỐ NGƯỜI đã duyệt, không phải số lượt ca — chef2 nhận 2 ca
  // vẫn chỉ là 1 người, nên đếm lại theo volunteerId duy nhất.
  const approved = await prisma.campaignVolunteerAssignment.findMany({
    where: {
      campaignId: CAMPAIGN_ID,
      role: 'chef',
      status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
    },
    select: { volunteerId: true },
  });
  const uniqueChefs = new Set(approved.map((a) => a.volunteerId)).size;
  await prisma.kitchenCampaign.update({
    where: { id: CAMPAIGN_ID },
    data: { chefSlotsFilled: uniqueChefs },
  });

  console.log(`\n✅ ${vol.user.fullName} đã vào "${campaign.title}"`);
  console.log(`   Đầu bếp đã duyệt (người): ${uniqueChefs}`);
  console.log(`\nLuồng đầu bếp — đăng nhập ${CHEF_EMAIL}:`);
  console.log(`   1. /kitchen/${CAMPAIGN_ID}/task   → Điểm danh tại bếp (cần cho phép GPS)`);
  console.log('   2. Bắt đầu nấu (chụp ảnh nguyên liệu)');
  console.log('   3. Hoàn thành (chụp ảnh món đã nấu) → +15 điểm cống hiến');
  console.log(`   Lịch làm việc: /kitchen/${CAMPAIGN_ID}/schedule — thấy cả 2 ca`);
})()
  .catch((e) => {
    console.error('❌ FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
