/* eslint-disable */
// Bổ sung mô tả + thực đơn + lịch trình + vật phẩm + ảnh (người Việt) cho các chiến dịch seed.
// Idempotent. Chạy: node prisma/seed-campaign-content.js
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Ảnh tự do từ Wikimedia Commons (bối cảnh ẩm thực / nông sản Việt Nam)
const IMG = {
  pho: 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Street_vendor_pho_ga_Hanoi.jpg',
  streetfood: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Street_Food_vendors_Soft_crab_Hanoi_Vietnam.jpg',
  caibe: 'https://upload.wikimedia.org/wikipedia/commons/3/37/Vietnam_08_-_116_-_Cai_Be_floating_market_%283185891184%29.jpg',
  farmer: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Rice_Farmer_in_Hoi_An%2C_Vietnam.jpg/1280px-Rice_Farmer_in_Hoi_An%2C_Vietnam.jpg',
};

// Khớp theo tiêu đề các chiến dịch trong seed-campaigns.js
const CONTENT = [
  {
    match: 'bệnh viện Q.Thủ Đức',
    image: IMG.pho,
    description:
      'Mỗi ngày, hàng trăm bệnh nhân và người nhà tại bệnh viện phải chắt chiu từng bữa ăn giữa lúc khó khăn. Chiến dịch nấu 200 suất cơm trao tận tay những hoàn cảnh ngặt nghèo, để không ai phải nhịn đói khi đang chống chọi với bệnh tật.\nMỗi suất cơm là một lời động viên ấm áp gửi đến người bệnh và gia đình họ.',
    menu: [
      { name: 'Cơm trắng', type: 'Món chính' },
      { name: 'Thịt kho trứng', type: 'Món mặn' },
      { name: 'Canh rau cải', type: 'Món canh' },
    ],
    schedule: [
      { time: '05:00 - 07:00', label: 'Đi chợ & sơ chế nguyên liệu' },
      { time: '07:00 - 10:00', label: 'Nấu nướng & chia suất' },
      { time: '10:00 - 11:00', label: 'Trao cơm tại bệnh viện' },
    ],
    supplies: ['Gạo', 'Thịt heo', 'Trứng', 'Rau xanh', 'Gia vị', 'Hộp đựng cơm'],
  },
  {
    match: 'Vinhomes Grand Park',
    image: IMG.streetfood,
    description:
      'Bếp 0 đồng cuối tuần ra đời với sứ mệnh không để ai bị bỏ lại phía sau. Chúng tôi nấu và trao những suất ăn miễn phí, nóng hổi cho người lao động nghèo, sinh viên và người già neo đơn tại địa phương.\nMỗi suất cơm là một câu chuyện tử tế, lan tỏa yêu thương từ cộng đồng.',
    menu: [
      { name: 'Cơm phần đầy đủ', type: 'Món chính' },
      { name: 'Rau củ xào', type: 'Món xào' },
      { name: 'Trái cây theo mùa', type: 'Tráng miệng' },
    ],
    schedule: [
      { time: '08:00 - 09:30', label: 'Chuẩn bị nguyên liệu & sơ chế' },
      { time: '09:30 - 11:30', label: 'Chế biến & nấu nướng' },
      { time: '11:30 - 12:00', label: 'Phân phát suất ăn' },
    ],
    supplies: ['Gạo', 'Rau củ quả', 'Dầu ăn', 'Gia vị', 'Trái cây'],
  },
  {
    match: 'vô gia cư Q.1',
    image: IMG.caibe,
    description:
      'Khi thành phố lên đèn, vẫn còn những người vô gia cư co ro qua đêm bên vỉa hè. Chiến dịch phát cháo đêm mang đến những phần cháo nóng và chiếc bánh mì ấm bụng, sẻ chia hơi ấm tình người trong những đêm khuya.',
    menu: [
      { name: 'Cháo thịt bằm', type: 'Món chính' },
      { name: 'Bánh mì', type: 'Món kèm' },
    ],
    schedule: [
      { time: '19:00 - 20:30', label: 'Nấu cháo & chuẩn bị' },
      { time: '20:30 - 22:00', label: 'Phát dọc các tuyến phố trung tâm' },
    ],
    supplies: ['Gạo', 'Thịt bằm', 'Hành ngò', 'Bánh mì', 'Ly/hộp đựng'],
  },
  {
    match: 'mái ấm trẻ em Gò Vấp',
    image: IMG.farmer,
    description:
      'Các em nhỏ tại mái ấm rất cần những bữa ăn đủ chất để lớn lên khỏe mạnh. Chiến dịch nấu ăn cho mái ấm mang đến những suất ăn dinh dưỡng, ngon miệng và tràn đầy yêu thương cho các em mỗi tuần.',
    menu: [
      { name: 'Cơm trắng', type: 'Món chính' },
      { name: 'Gà kho gừng', type: 'Món mặn' },
      { name: 'Canh bí đỏ', type: 'Món canh' },
      { name: 'Sữa chua', type: 'Tráng miệng' },
    ],
    schedule: [
      { time: '09:00 - 10:30', label: 'Sơ chế nguyên liệu' },
      { time: '10:30 - 12:30', label: 'Nấu nướng' },
      { time: '12:30 - 13:00', label: 'Dọn & cùng các em dùng bữa' },
    ],
    supplies: ['Gạo', 'Thịt gà', 'Bí đỏ', 'Rau củ', 'Sữa chua'],
  },
];

async function main() {
  // An toàn: đảm bảo 3 cột nội dung tồn tại (phòng khi chưa chạy migration)
  await prisma.$executeRawUnsafe(`ALTER TABLE kitchen_campaigns ADD COLUMN IF NOT EXISTS menu_items JSONB NOT NULL DEFAULT '[]'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE kitchen_campaigns ADD COLUMN IF NOT EXISTS schedule_items JSONB NOT NULL DEFAULT '[]'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE kitchen_campaigns ADD COLUMN IF NOT EXISTS supply_items JSONB NOT NULL DEFAULT '[]'`);

  let updated = 0;
  for (const c of CONTENT) {
    const row = await prisma.kitchenCampaign.findFirst({
      where: { title: { contains: c.match } },
      select: { id: true, title: true },
    });
    if (!row) {
      console.log('  ⚠ không thấy campaign khớp:', c.match);
      continue;
    }
    await prisma.kitchenCampaign.update({
      where: { id: row.id },
      data: {
        description: c.description,
        imageUrls: [c.image],
        menuItems: c.menu,
        scheduleItems: c.schedule,
        supplyItems: c.supplies,
      },
    });
    updated++;
    console.log('  ✓ cập nhật:', row.title);
  }
  console.log(`\nDone. ${updated}/${CONTENT.length} chiến dịch đã có mô tả + ảnh + nội dung.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
