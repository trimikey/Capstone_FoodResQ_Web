require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ORG_EMAIL = 'tochuc4@gmail.com';
const TITLE = 'Chiến dịch khẩn — 18:00 hnay → 12:00 trưa mai';

// Giờ VN: campaign bắt đầu 18:00 hôm nay (2026-08-09), kết thúc 12:00 ngày mai (2026-08-10)
const CAMPAIGN_START = '18:00';
const CAMPAIGN_END   = '12:00'; // 12:00 ngày mai

// Dish steps bắt đầu từ 18:00, mỗi step ~1h
const MENU = [
  { name: 'Cơm gà xối mỡ', plannedServings: 50,
    steps: [
      { order: 1, name: 'Sơ chế',               time: '18:00' },
      { order: 2, name: 'Nấu',                   time: '19:00' },
      { order: 3, name: 'Trình bày',             time: '20:30' },
      { order: 4, name: 'Sẵn sàng phát xuất',   time: '21:00' },
    ],
  },
  { name: 'Canh rau ngót thịt bằm', plannedServings: 80,
    steps: [
      { order: 1, name: 'Sơ chế',               time: '18:00' },
      { order: 2, name: 'Nấu',                   time: '18:30' },
      { order: 3, name: 'Trình bày',             time: '20:30' },
      { order: 4, name: 'Sẵn sàng phát xuất',   time: '21:00' },
    ],
  },
  { name: 'Chuối tráng miệng', plannedServings: 80,
    steps: [
      { order: 1, name: 'Sơ chế',               time: '18:00' },
      { order: 2, name: 'Nấu',                   time: '18:15' },
      { order: 3, name: 'Trình bày',             time: '20:30' },
      { order: 4, name: 'Sẵn sàng phát xuất',   time: '21:00' },
    ],
  },
];

const SHIFTS = [
  { label: 'Ca tối — Sơ chế', role: 'chef', startTime: '18:00', endTime: '21:00', slotsNeeded: 3 },
  { label: 'Ca đêm — Hoàn tất', role: 'chef', startTime: '21:00', endTime: '12:00', slotsNeeded: 2 },
];

const SUPPLIES = [
  { name: 'Gạo', quantity: 15, unit: 'kg' },
  { name: 'Thịt gà', quantity: 10, unit: 'kg' },
  { name: 'Rau ngót', quantity: 5, unit: 'kg' },
  { name: 'Hộp đựng suất ăn', quantity: 90, unit: 'cái' },
];

(async () => {
  const org = await p.receiverProfile.findFirst({
    where: { isCharityOrg: true, user: { email: ORG_EMAIL } },
    select: { id: true },
  });
  if (!org) throw new Error(`Không tìm thấy tổ chức ${ORG_EMAIL}`);

  // Hôm nay 2026-08-09, ngày mai 2026-08-10
  const today    = new Date(Date.UTC(2026, 7, 9));
  const tomorrow = new Date(Date.UTC(2026, 7, 10));

  // Tạo campaign
  const [row] = await p.$queryRaw`
    INSERT INTO kitchen_campaigns (
      charity_receiver_id, title, description, kitchen_address, kitchen_location,
      scheduled_date, end_date, start_time, end_time,
      chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
      status, expected_servings, image_urls, menu_items, schedule_items, supply_items,
      created_at, updated_at
    ) VALUES (
      ${org.id}::uuid,
      ${TITLE},
      ${'Chiến dịch khẩn: bắt đầu 18:00 hôm nay, kết thúc 12:00 trưa mai. Phục vụ bữa tối hôm nay + bữa trưa ngày mai.'},
      ${'Đường số 8, Linh Chiểu, Thủ Đức, TP.HCM'},
      ST_SetSRID(ST_MakePoint(${106.7699}, ${10.8506}), 4326)::geography,
      ${today}::date, ${tomorrow}::date, ${CAMPAIGN_START}, ${CAMPAIGN_END},
      ${3}, ${2}, ${1},
      'in_progress'::campaign_status, ${90},
      '[]'::jsonb,
      ${JSON.stringify(MENU.map((m) => ({ name: m.name, plannedServings: m.plannedServings })))}::jsonb,
      '[]'::jsonb,
      ${JSON.stringify(SUPPLIES)}::jsonb,
      NOW(), NOW()
    ) RETURNING id
  `;
  const cid = row.id;
  console.log(`✅ Tạo campaign: ${cid}`);
  console.log(`   ${TITLE}`);
  console.log(`   Thời gian: ${CAMPAIGN_START} hôm nay → ${CAMPAIGN_END} ngày mai`);

  // Tạo shifts
  const shifts = await p.campaignShift.createManyAndReturn({
    data: SHIFTS.map((s) => ({ campaignId: cid, ...s })),
  });
  console.log(`\n✅ ${shifts.length} ca:`);
  shifts.forEach((s) => console.log(`   ${s.label} (${s.startTime}–${s.endTime})`));

  // Tạo menu items + dish steps
  for (let i = 0; i < MENU.length; i++) {
    const m = MENU[i];
    const mi = await p.campaignMenuItem.create({
      data: {
        campaignId: cid,
        customName: m.name,
        plannedServings: m.plannedServings,
        sortOrder: i,
      },
    });
    await p.campaignDishStep.createMany({
      data: m.steps.map((s) => ({
        campaignId: cid,
        menuItemId: mi.id,
        stepOrder: s.order,
        stepName: s.name,
        scheduledTime: s.time,
        status: 'locked',
      })),
    });
    console.log(`✅ Món ${m.name}: ${m.steps.length} steps`);
  }

  // Giao ca cho chef2
  const vol = await p.volunteerProfile.findFirst({
    where: { user: { email: 'chef2@gmail.com' } },
    select: { id: true },
  });
  if (vol) {
    const shift = shifts.find((s) => s.role === 'chef' && s.startTime === '18:00');
    if (shift) {
      await p.campaignVolunteerAssignment.create({
        data: { campaignId: cid, volunteerId: vol.id, shiftId: shift.id, role: 'chef', status: 'assigned' },
      });
      await p.campaignShift.update({ where: { id: shift.id }, data: { slotsFilled: 1 } });
      console.log(`\n✅ Chef2 được giao ca "Ca tối — Sơ chế" (${CAMPAIGN_START}–21:00)`);
    }
  }

  console.log(`\n📋 TEST:`);
  console.log(`   Chiến dịch:  /campaigns/${cid}/manage`);
  console.log(`   Chef2 đăng nhập → /my-tasks → Điểm danh ngay ✅`);
  console.log(`   Steps hiện tại (18:28): sơ chế sẽ auto-unlock khi cron chạy`);

  await p.$disconnect();
})().catch(async (e) => { console.error('❌', e.message); await p.$disconnect(); });
