/**
 * Seed 3 món DEMO (mỗi món có quy trình 4 khâu cố định) cho chiến dịch
 * "DEMO luông bếp — TNV nhiều ca" đã có sẵn từ seed-demo-campaign.cjs.
 *
 * 4 khâu: Sơ chế → Nấu → Trình bày → Sẵn sàng phát xuất.
 * Giờ dự kiến (giờ VN, HH:mm):
 *   - Cơm gà xối mỡ (70 phần):  06:30 / 09:00 / 10:30 / 11:00
 *   - Canh rau ngót (120 phần): 06:00 / 08:30 / 10:00 / 11:00
 *   - Chuối tráng miệng:        07:00 / 09:30 / 10:30 / 11:00
 *
 * CHẠY: node seed-dish-steps-demo.cjs
 *  (idempotent — chạy lại nhiều lần OK)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TITLE = 'DEMO luồng bếp — TNV nhiều ca';

// Cấu hình 3 món × 4 khâu. Giờ khác nhau để có timeline rõ ràng trong lịch tuần.
const DISH_STEPS_CONFIG = [
  {
    name: 'Canh rau ngót thịt bằm', // Sớm nhất — làm canh trước
    servings: 120,
    times: ['06:00', '08:30', '10:00', '11:00'],
  },
  {
    name: 'Cơm gà xối mỡ', // Món chính — bắt đầu sau canh
    servings: 70,
    times: ['06:30', '09:00', '10:30', '11:00'],
  },
  {
    name: 'Chuối tráng miệng', // Món cuối — nhẹ nhất
    servings: 120,
    times: ['07:00', '09:30', '10:30', '11:00'],
  },
];

(async () => {
  const campaign = await prisma.kitchenCampaign.findFirst({
    where: { title: TITLE },
    select: { id: true, title: true, menuItemRefs: { select: { id: true, customName: true } } },
  });
  if (!campaign) {
    console.error(`❌ Không tìm thấy campaign "${TITLE}". Chạy seed-demo-campaign.cjs trước.`);
    process.exit(1);
  }

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const config of DISH_STEPS_CONFIG) {
    const menuItem = campaign.menuItemRefs.find((m) => m.customName === config.name);
    if (!menuItem) {
      console.warn(`⚠️  Không tìm thấy menu item "${config.name}" — bỏ qua.`);
      continue;
    }

    // Xoá step cũ nếu có (idempotent)
    await prisma.campaignDishStep.deleteMany({
      where: { campaignId: campaign.id, menuItemId: menuItem.id },
    });

    const FIXED = [
      { order: 1, name: 'Sơ chế' },
      { order: 2, name: 'Nấu' },
      { order: 3, name: 'Trình bày' },
      { order: 4, name: 'Sẵn sàng phát xuất' },
    ];

    const data = FIXED.map((step, idx) => ({
      campaignId: campaign.id,
      menuItemId: menuItem.id,
      stepOrder: step.order,
      stepName: step.name,
      scheduledTime: config.times[idx],
    }));

    const result = await prisma.campaignDishStep.createMany({ data });
    totalCreated += result.count;
    console.log(`   ✅ ${config.name}: ${result.count} khâu (${config.times.join(' / ')})`);
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`Đã tạo ${totalCreated} bản ghi dish_step cho campaign ${campaign.id}`);
  console.log(`Bỏ qua ${totalSkipped} món không tìm thấy.`);
  console.log(`\nMở trang chi tiết: /my-tasks/<assignment-id>`);
  console.log('═══════════════════════════════════════════\n');
})()
  .catch((e) => {
    console.error('❌ FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());