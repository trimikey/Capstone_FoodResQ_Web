/*
 * Tạo 1 chiến dịch DEMO đang chạy (in_progress) để đi hết các luồng bếp:
 * đăng ký TNV (có người nhận NHIỀU CA), phân phối suất ăn, lịch trình, thực đơn, vật phẩm.
 *
 * CHỈ THÊM dữ liệu mới, không sửa/xoá bản ghi nào đang có.
 * Chạy: node seed-demo-campaign.cjs
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const ORG_EMAIL = 'tochuc4@gmail.com';
const TITLE = 'DEMO luồng bếp — TNV nhiều ca';

// Ca xếp NỐI TIẾP trong cùng vai trò để một người nhận được 2 ca (06–09 rồi 09–12).
const SHIFTS = [
  { label: 'Ca sáng — Sơ chế', role: 'chef', startTime: '06:00', endTime: '09:00', slotsNeeded: 3 },
  { label: 'Ca trưa — Nấu chính', role: 'chef', startTime: '09:00', endTime: '12:00', slotsNeeded: 3 },
  { label: 'Phục vụ bữa trưa', role: 'waiter', startTime: '11:00', endTime: '13:30', slotsNeeded: 3 },
  { label: 'Vận chuyển bữa trưa', role: 'shipper', startTime: '11:00', endTime: '13:30', slotsNeeded: 2 },
];

const MENU = [
  { name: 'Cơm gà xối mỡ', type: 'main', plannedServings: 70 },
  { name: 'Canh rau ngót thịt bằm', type: 'soup', plannedServings: 120 },
  { name: 'Chuối tráng miệng', type: 'dessert', plannedServings: 120 },
];

const SCHEDULE = [
  { time: '06:00', label: 'Tập trung tại bếp, phân công nhiệm vụ' },
  { time: '06:30', label: 'Kiểm tra nguyên liệu, dụng cụ và thiết bị bếp' },
  { time: '07:00', label: 'Rửa, sơ chế rau củ, vo gạo' },
  { time: '09:00', label: 'Bắt đầu nấu các món chính' },
  { time: '10:30', label: 'Đóng gói suất, dán nhãn' },
  { time: '11:00', label: 'Tập kết suất tại điểm phát' },
  { time: '11:30', label: 'Bắt đầu phát suất ăn' },
  { time: '13:30', label: 'Dọn dẹp, tổng kết số suất' },
];

const SUPPLIES = [
  { name: 'Gạo', quantity: 25, unit: 'kg' },
  { name: 'Thịt gà', quantity: 18, unit: 'kg' },
  { name: 'Rau ngót', quantity: 8, unit: 'kg' },
  { name: 'Hộp đựng suất ăn', quantity: 130, unit: 'cái' },
  { name: 'Gas công nghiệp', quantity: 2, unit: 'bình' },
];

/** Hôm nay theo giờ VN, ép về mốc DATE để khớp cột @db.Date. */
function todayVN() {
  const nowVN = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()));
}

(async () => {
  const org = await prisma.receiverProfile.findFirst({
    where: { isCharityOrg: true, user: { email: ORG_EMAIL } },
    select: { id: true, organizationName: true, address: true },
  });
  if (!org) throw new Error(`Không tìm thấy tổ chức ${ORG_EMAIL}`);

  const existing = await prisma.kitchenCampaign.findFirst({
    where: { charityReceiverId: org.id, title: TITLE },
    select: { id: true },
  });
  if (existing) {
    console.log(`Đã tồn tại chiến dịch demo: ${existing.id} — không tạo trùng.`);
    console.log(`   /campaigns/${existing.id}/manage`);
    return;
  }

  // TNV theo chuyên môn. Lấy nhiều hơn số cần để còn người cho luồng "chờ duyệt".
  const specs = await prisma.volunteerSpecializationEntry.findMany({
    where: { volunteer: { user: { status: 'active' } } },
    select: { specialization: true, volunteerId: true, volunteer: { select: { user: { select: { fullName: true } } } } },
  });
  const pool = { chef: [], waiter: [], shipper: [] };
  for (const s of specs) {
    const list = pool[s.specialization];
    if (list && !list.some((v) => v.id === s.volunteerId)) {
      list.push({ id: s.volunteerId, name: s.volunteer.user.fullName });
    }
  }
  console.log(`TNV khả dụng — bếp: ${pool.chef.length}, phục vụ: ${pool.waiter.length}, giao hàng: ${pool.shipper.length}`);

  const date = todayVN();

  const campaignId = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw`
      INSERT INTO kitchen_campaigns (
        charity_receiver_id, title, description, kitchen_address, kitchen_location,
        scheduled_date, end_date, start_time, end_time,
        chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
        status, expected_servings, image_urls, menu_items, schedule_items, supply_items,
        created_at, updated_at
      ) VALUES (
        ${org.id}::uuid, ${TITLE},
        ${'Chiến dịch demo để chạy thử toàn bộ luồng bếp: đăng ký TNV theo ca (một người nhận nhiều ca nối tiếp), phân phối suất ăn, lịch trình và vật phẩm.'},
        ${org.address || 'Đường số 8, Linh Chiểu, Thủ Đức, TP.HCM'},
        ST_SetSRID(ST_MakePoint(${106.7699}, ${10.8506}), 4326)::geography,
        ${date}::date, ${date}::date, ${'06:00'}, ${'18:00'},
        ${3}, ${3}, ${2},
        'in_progress'::campaign_status, ${120},
        '[]'::jsonb,
        ${JSON.stringify(MENU)}::jsonb,
        ${JSON.stringify(SCHEDULE)}::jsonb,
        ${JSON.stringify(SUPPLIES)}::jsonb,
        NOW(), NOW()
      ) RETURNING id
    `;
    const id = row.id;

    await tx.campaignShift.createMany({
      data: SHIFTS.map((s) => ({ campaignId: id, ...s })),
    });

    await tx.campaignMenuItem.createMany({
      data: MENU.map((m, i) => ({
        campaignId: id,
        customName: m.name,
        plannedServings: m.plannedServings,
        sortOrder: i,
      })),
    });

    return id;
  });

  const shifts = await prisma.campaignShift.findMany({
    where: { campaignId },
    orderBy: { startTime: 'asc' },
  });
  const byLabel = Object.fromEntries(shifts.map((s) => [s.label, s]));

  /**
   * Phân công demo. Điểm chính: chef đầu tiên nhận CẢ HAI ca bếp nối tiếp
   * (06–09 và 09–12) để thấy luồng một người nhiều ca.
   */
  const plan = [
    { role: 'chef', vol: pool.chef[0], shift: 'Ca sáng — Sơ chế', status: 'assigned' },
    { role: 'chef', vol: pool.chef[0], shift: 'Ca trưa — Nấu chính', status: 'assigned' },
    { role: 'chef', vol: pool.chef[1], shift: 'Ca sáng — Sơ chế', status: 'checked_in' },
    { role: 'chef', vol: pool.chef[2], shift: 'Ca trưa — Nấu chính', status: 'pending' },
    { role: 'waiter', vol: pool.waiter[0], shift: 'Phục vụ bữa trưa', status: 'assigned' },
    { role: 'waiter', vol: pool.waiter[1], shift: 'Phục vụ bữa trưa', status: 'pending' },
    { role: 'shipper', vol: pool.shipper[0], shift: 'Vận chuyển bữa trưa', status: 'assigned' },
    { role: 'shipper', vol: pool.shipper[1], shift: 'Vận chuyển bữa trưa', status: 'pending' },
  ].filter((x) => x.vol && byLabel[x.shift]);

  for (const item of plan) {
    await prisma.campaignVolunteerAssignment.create({
      data: {
        campaignId,
        volunteerId: item.vol.id,
        shiftId: byLabel[item.shift].id,
        role: item.role,
        status: item.status,
        ...(item.status === 'checked_in' ? { checkInTime: new Date() } : {}),
      },
    });
  }

  // slots_filled chỉ đếm người ĐÃ DUYỆT (pending chưa tính) — khớp cách service tính.
  const approved = plan.filter((x) => x.status !== 'pending');
  const uniq = (role) => new Set(approved.filter((x) => x.role === role).map((x) => x.vol.id)).size;
  await prisma.kitchenCampaign.update({
    where: { id: campaignId },
    data: {
      chefSlotsFilled: uniq('chef'),
      waiterSlotsFilled: uniq('waiter'),
      shipperSlotsFilled: uniq('shipper'),
    },
  });

  for (const s of shifts) {
    const filled = approved.filter((x) => byLabel[x.shift].id === s.id).length;
    if (filled > 0) {
      await prisma.campaignShift.update({ where: { id: s.id }, data: { slotsFilled: filled } });
    }
  }

  console.log('\n✅ Đã tạo chiến dịch demo');
  console.log(`   id: ${campaignId}`);
  console.log(`   Quản lý:     /campaigns/${campaignId}/manage`);
  console.log(`   Chờ duyệt:   /campaigns/${campaignId}/manage/registrations`);
  console.log(`   Phân phối:   /campaigns/${campaignId}/manage/distribution`);
  console.log(`   Thực đơn:    /campaigns/${campaignId}/manage/menu`);
  console.log(`   Lịch trình:  /campaigns/${campaignId}/manage/schedule`);
  console.log(`   Chỉnh sửa:   /campaigns/${campaignId}/edit`);
  console.log(`   Công khai:   /campaigns/${campaignId}`);
  console.log('\nPhân công:');
  plan.forEach((x) => console.log(`   ${x.vol.name} · ${x.role} · ${x.shift} · ${x.status}`));
})()
  .catch((e) => {
    console.error('❌ FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
