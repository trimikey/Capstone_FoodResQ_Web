/*
 * Seed thực phẩm quanh MỘT KHU VỰC để test màn "Tìm thực phẩm" theo GPS
 * (đứng ở khu chưa có tin nào trong 5km thì danh sách luôn trống).
 *
 * CHỈ THÊM dữ liệu mới, không sửa/xoá bản ghi nào đang có. Idempotent: tin trùng
 * tiêu đề của cùng provider sẽ bị bỏ qua khi chạy lại.
 *
 * Chạy: node prisma/seed-nearby-listings.cjs <khu>
 *   <khu> = thaodien | quan12   (mặc định: thaodien)
 * Thêm khu mới: bổ sung một entry vào AREAS bên dưới với toạ độ + địa chỉ thật.
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const IMG = {
  lunchbox: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917394/foodresq/food_lunchbox.jpg',
  salad: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917395/foodresq/food_salad.jpg',
};

// Mỗi item: [title, category, unit, qty, maxPer, lat, lng, address, img, isSurprise]
const AREAS = {
  thaodien: [
    ['Cơm gà xối mỡ — suất văn phòng dư', 'cooked_meal', 'portion', 15, 3, 10.8032, 106.7337, '35 Quốc Hương, Thảo Điền, TP. Thủ Đức', IMG.lunchbox, false],
    ['Bánh mì thịt nguội cuối ngày', 'bakery', 'item', 20, 3, 10.8069, 106.7300, '12 Xuân Thủy, Thảo Điền, TP. Thủ Đức', IMG.lunchbox, false],
    ['Salad rau củ hữu cơ (hạn dùng hôm nay)', 'vegetables', 'portion', 10, 2, 10.8009, 106.7391, '215 Nguyễn Văn Hưởng, Thảo Điền, TP. Thủ Đức', IMG.salad, false],
    ['Trái cây tươi tổng hợp — thanh lý quầy', 'fresh_fruit', 'kg', 12, 3, 10.7980, 106.7260, '48 Thảo Điền, TP. Thủ Đức', IMG.salad, false],
    ['Túi bất ngờ tiệm bánh (bánh ngọt mix)', 'bakery', 'box', 8, 2, 10.8102, 106.7418, '89 Nguyễn Duy Trinh, Bình Trưng Tây, TP. Thủ Đức', IMG.lunchbox, true],
    ['Sữa hạt & nước ép cận date', 'beverage', 'item', 24, 4, 10.7935, 106.7223, '167 Nguyễn Hoàng, An Phú, TP. Thủ Đức', IMG.salad, false],
    ['Cơm chay thập cẩm — bếp dư 10 suất', 'cooked_meal', 'portion', 10, 2, 10.8078, 106.7256, '5 Tống Hữu Định, Thảo Điền, TP. Thủ Đức', IMG.lunchbox, false],
    ['Rau củ quả cuối phiên chợ', 'vegetables', 'kg', 18, 5, 10.7897, 106.7345, '30 Đồng Văn Cống, Thạnh Mỹ Lợi, TP. Thủ Đức', IMG.salad, false],
  ],
  quan12: [
    ['Cơm tấm sườn — quán dư cuối trưa', 'cooked_meal', 'portion', 14, 3, 10.8672, 106.6202, '123 Nguyễn Ảnh Thủ, Tân Thới Hiệp, Quận 12', IMG.lunchbox, false],
    ['Bánh mì & bánh bao cuối ngày', 'bakery', 'item', 22, 3, 10.8620, 106.6135, '456 Tô Ký, Trung Mỹ Tây, Quận 12', IMG.lunchbox, false],
    ['Rau muống + cải xanh vườn nhà', 'vegetables', 'kg', 15, 4, 10.8710, 106.6255, '78 Nguyễn Thị Búp, Hiệp Thành, Quận 12', IMG.salad, false],
    ['Chuối & ổi chín cây thanh lý', 'fresh_fruit', 'kg', 20, 4, 10.8590, 106.6238, '25 Trần Thị Năm, Trung Mỹ Tây, Quận 12', IMG.salad, false],
    ['Túi bất ngờ lò bánh Bà Điểm', 'bakery', 'box', 6, 2, 10.8748, 106.6150, '390 Nguyễn Ảnh Thủ, Bà Điểm, Hóc Môn', IMG.lunchbox, true],
    ['Nước sâm & trà tắc đóng chai cận date', 'beverage', 'item', 30, 5, 10.8555, 106.6280, '10 Huỳnh Thị Hai, Trung Mỹ Tây, Quận 12', IMG.salad, false],
    ['Hủ tiếu chay — bếp từ thiện dư suất', 'cooked_meal', 'portion', 12, 2, 10.8730, 106.6330, '215 Lê Văn Khương, Hiệp Thành, Quận 12', IMG.lunchbox, false],
    ['Rau củ siêu thị mini cuối ngày', 'vegetables', 'kg', 16, 4, 10.8508, 106.6265, 'Gần Công viên phần mềm Quang Trung, Tân Chánh Hiệp, Quận 12', IMG.salad, false],
  ],
};

async function main() {
  const areaKey = process.argv[2] || 'thaodien';
  const items = AREAS[areaKey];
  if (!items) {
    console.error(`Không có khu "${areaKey}". Các khu: ${Object.keys(AREAS).join(', ')}`);
    process.exit(1);
  }

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
  for (let i = 0; i < items.length; i++) {
    const [title, category, unit, qty, maxPer, lat, lng, address, img, surprise] = items[i];
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
        ${'Thực phẩm còn tốt, dư trong ngày — chia sẻ 0đ cho cộng đồng.'},
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
  console.log(`\nXong — tạo mới ${created}/${items.length} tin cho khu "${areaKey}".`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
