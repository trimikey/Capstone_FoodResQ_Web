/*
 * Seed thực phẩm quanh khu THẢO ĐIỀN / QUỐC HƯƠNG (TP. Thủ Đức) — phục vụ test
 * màn "Tìm thực phẩm" khi đứng ở vị trí GPS khu này (trước đó 0 kết quả trong 5km).
 *
 * CHỈ THÊM dữ liệu mới, không sửa/xoá bản ghi nào đang có. Idempotent: tin trùng
 * tiêu đề của cùng provider sẽ bị bỏ qua khi chạy lại.
 * Chạy: node prisma/seed-thaodien-listings.cjs
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const IMG = {
  lunchbox: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917394/foodresq/food_lunchbox.jpg',
  salad: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917395/foodresq/food_salad.jpg',
};

// [title, category, unit, qty, maxPer, lat, lng, address, img, isSurprise]
const LISTINGS = [
  ['Cơm gà xối mỡ — suất văn phòng dư', 'cooked_meal', 'portion', 15, 3, 10.8032, 106.7337, '35 Quốc Hương, Thảo Điền, TP. Thủ Đức', IMG.lunchbox, false],
  ['Bánh mì thịt nguội cuối ngày', 'bakery', 'item', 20, 3, 10.8069, 106.7300, '12 Xuân Thủy, Thảo Điền, TP. Thủ Đức', IMG.lunchbox, false],
  ['Salad rau củ hữu cơ (hạn dùng hôm nay)', 'vegetables', 'portion', 10, 2, 10.8009, 106.7391, '215 Nguyễn Văn Hưởng, Thảo Điền, TP. Thủ Đức', IMG.salad, false],
  ['Trái cây tươi tổng hợp — thanh lý quầy', 'fresh_fruit', 'kg', 12, 3, 10.7980, 106.7260, '48 Thảo Điền, TP. Thủ Đức', IMG.salad, false],
  ['Túi bất ngờ tiệm bánh (bánh ngọt mix)', 'bakery', 'box', 8, 2, 10.8102, 106.7418, '89 Nguyễn Duy Trinh, Bình Trưng Tây, TP. Thủ Đức', IMG.lunchbox, true],
  ['Sữa hạt & nước ép cận date', 'beverage', 'item', 24, 4, 10.7935, 106.7223, '167 Nguyễn Hoàng, An Phú, TP. Thủ Đức', IMG.salad, false],
  ['Cơm chay thập cẩm — bếp dư 10 suất', 'cooked_meal', 'portion', 10, 2, 10.8078, 106.7256, '5 Tống Hữu Định, Thảo Điền, TP. Thủ Đức', IMG.lunchbox, false],
  ['Rau củ quả cuối phiên chợ', 'vegetables', 'kg', 18, 5, 10.7897, 106.7345, '30 Đồng Văn Cống, Thạnh Mỹ Lợi, TP. Thủ Đức', IMG.salad, false],
];

async function main() {
  // Chia đều cho vài NCC seed đã duyệt (@foodresq.vn) — không đụng NCC thật
  const providers = await prisma.$queryRawUnsafe(`
    SELECT pp.id FROM provider_profiles pp
    JOIN users u ON u.id = pp.user_id
    WHERE u.email LIKE '%@foodresq.vn' AND pp.verification_status = 'approved'
    ORDER BY pp.created_at LIMIT 4
  `);
  if (providers.length === 0) throw new Error('Không tìm thấy provider seed @foodresq.vn nào');

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000); // mở nhận từ 1h trước
  const end = new Date(now.getTime() + 2 * 24 * 3600 * 1000); // nhận trong 2 ngày

  let created = 0;
  for (let i = 0; i < LISTINGS.length; i++) {
    const [title, category, unit, qty, maxPer, lat, lng, address, img, surprise] = LISTINGS[i];
    const providerId = providers[i % providers.length].id;
    const dup = await prisma.$queryRaw(Prisma.sql`
      SELECT id FROM food_listings WHERE provider_id = ${providerId}::uuid AND title = ${title} AND deleted_at IS NULL LIMIT 1
    `);
    if (dup.length) { console.log('bỏ qua (đã có):', title); continue; }
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO food_listings (
        provider_id, title, description, category,
        quantity_total, quantity_remaining, quantity_unit,
        pickup_start_time, pickup_end_time, expiry_time,
        pickup_address, pickup_location,
        max_per_reservation, image_urls, is_surprise_bag, status, created_at, updated_at
      ) VALUES (
        ${providerId}::uuid, ${title},
        ${'Thực phẩm còn tốt, dư trong ngày — chia sẻ 0đ cho cộng đồng khu Thảo Điền.'},
        ${category}::food_category,
        ${qty}, ${qty}, ${unit}::quantity_unit,
        ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz,
        ${address}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${maxPer}, ${JSON.stringify([img])}::jsonb, ${surprise}, 'active'::listing_status, NOW(), NOW()
      )
    `);
    created++;
    console.log('tạo:', title);
  }
  console.log(`\nXong — tạo mới ${created}/${LISTINGS.length} tin quanh Thảo Điền.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
