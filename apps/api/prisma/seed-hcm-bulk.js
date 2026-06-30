/* eslint-disable */
// Seed HÀNG LOẠT (~110 listing) rải đều khắp các quận/phường TP.HCM,
// gồm cụm dày quanh Thủ Đức / Q9 (Long Bình, Lò Lu, Nguyễn Xiển).
// Idempotent: mỗi provider xoá listing chưa có reservation rồi tạo lại.
// Chạy: node prisma/seed-hcm-bulk.js
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// Mỗi area = 1 cửa hàng + ~5 món rải quanh. Nhiều area ở Thủ Đức/Q9 để gần người dùng.
const AREAS = [
  // ── Thủ Đức / Quận 9 (khu vực người dùng) — seed dày ──
  { slug: 'longbinh', name: 'Bếp Long Bình', type: 'restaurant', ward: 'P. Long Bình', lat: 10.8505, lng: 106.8390 },
  { slug: 'lolu', name: 'Tiệm Bánh Lò Lu', type: 'bakery', ward: 'Đường Lò Lu, Long Trường', lat: 10.8440, lng: 106.8330 },
  { slug: 'nguyenxien', name: 'Siêu Thị Nguyễn Xiển', type: 'supermarket', ward: 'Nguyễn Xiển, Long Thạnh Mỹ', lat: 10.8580, lng: 106.8300 },
  { slug: 'grandpark', name: 'Quán Ăn Grand Park', type: 'restaurant', ward: 'Vinhomes Grand Park', lat: 10.8430, lng: 106.8440 },
  { slug: 'longthanhmy', name: 'Vựa Trái Cây Long Thạnh Mỹ', type: 'other', ward: 'P. Long Thạnh Mỹ', lat: 10.8390, lng: 106.8200 },
  { slug: 'truongthanh', name: 'Lò Bánh Trường Thạnh', type: 'bakery', ward: 'P. Trường Thạnh', lat: 10.8300, lng: 106.8350 },
  // ── Thủ Đức (cũ) / Q2 ──
  { slug: 'thaodien', name: 'Bếp Thảo Điền', type: 'restaurant', ward: 'P. Thảo Điền, Q2', lat: 10.8030, lng: 106.7400 },
  { slug: 'anphu', name: 'Siêu Thị An Phú', type: 'supermarket', ward: 'P. An Phú, Q2', lat: 10.7950, lng: 106.7520 },
  { slug: 'hiephuou', name: 'Quán Cơm Hiệp Phú', type: 'restaurant', ward: 'P. Hiệp Phú, Q9', lat: 10.8460, lng: 106.7800 },
  { slug: 'thuduccenter', name: 'Tiệm Bánh Thủ Đức', type: 'bakery', ward: 'P. Linh Trung, Thủ Đức', lat: 10.8650, lng: 106.7700 },
  // ── Nội thành ──
  { slug: 'q1', name: 'Nhà Hàng Bến Thành', type: 'restaurant', ward: 'P. Bến Nghé, Q1', lat: 10.7769, lng: 106.7009 },
  { slug: 'q3', name: 'Tiệm Bánh Võ Văn Tần', type: 'bakery', ward: 'P. 6, Q3', lat: 10.7841, lng: 106.6850 },
  { slug: 'q4', name: 'Quán Cơm Quận 4', type: 'restaurant', ward: 'P. 8, Q4', lat: 10.7578, lng: 106.7050 },
  { slug: 'q5', name: 'Siêu Thị Chợ Lớn', type: 'supermarket', ward: 'P. 11, Q5', lat: 10.7540, lng: 106.6630 },
  { slug: 'q6', name: 'Vựa Rau Bình Tây', type: 'other', ward: 'P. 2, Q6', lat: 10.7460, lng: 106.6350 },
  { slug: 'q7', name: 'Bếp Phú Mỹ Hưng', type: 'restaurant', ward: 'P. Tân Phong, Q7', lat: 10.7290, lng: 106.7220 },
  { slug: 'q8', name: 'Tiệm Bánh Quận 8', type: 'bakery', ward: 'P. 4, Q8', lat: 10.7240, lng: 106.6280 },
  { slug: 'q10', name: 'Siêu Thị Quận 10', type: 'supermarket', ward: 'P. 12, Q10', lat: 10.7730, lng: 106.6670 },
  { slug: 'q11', name: 'Quán Ăn Quận 11', type: 'restaurant', ward: 'P. 5, Q11', lat: 10.7640, lng: 106.6500 },
  { slug: 'q12', name: 'Vựa Trái Cây Quận 12', type: 'other', ward: 'P. Hiệp Thành, Q12', lat: 10.8670, lng: 106.6540 },
  { slug: 'binhthanh', name: 'Bếp Bình Thạnh', type: 'restaurant', ward: 'P. 25, Bình Thạnh', lat: 10.8100, lng: 106.7090 },
  { slug: 'phunhuan', name: 'Tiệm Bánh Phú Nhuận', type: 'bakery', ward: 'P. 7, Phú Nhuận', lat: 10.7990, lng: 106.6800 },
  { slug: 'govap', name: 'Siêu Thị Gò Vấp', type: 'supermarket', ward: 'P. 10, Gò Vấp', lat: 10.8380, lng: 106.6650 },
  { slug: 'tanbinh', name: 'Quán Cơm Tân Bình', type: 'restaurant', ward: 'P. 4, Tân Bình', lat: 10.8010, lng: 106.6520 },
  { slug: 'tanphu', name: 'Lò Bánh Tân Phú', type: 'bakery', ward: 'P. Tân Sơn Nhì, Tân Phú', lat: 10.7900, lng: 106.6280 },
  { slug: 'binhtan', name: 'Siêu Thị Bình Tân', type: 'supermarket', ward: 'P. Bình Trị Đông, Bình Tân', lat: 10.7650, lng: 106.6020 },
  { slug: 'nhabe', name: 'Quán Ăn Nhà Bè', type: 'restaurant', ward: 'TT. Nhà Bè', lat: 10.6950, lng: 106.7370 },
  { slug: 'hocmon', name: 'Vựa Nông Sản Hóc Môn', type: 'other', ward: 'X. Đông Thạnh, Hóc Môn', lat: 10.8870, lng: 106.5950 },
];

// Bộ món mẫu — gán ngẫu nhiên cho mỗi cửa hàng
const FOODS = [
  { title: 'Cơm tấm sườn dư ca', category: 'prepared_meal', unit: 'portion', weight: 0.45, img: '/com-ga-hoi-an.png' },
  { title: 'Cơm gà xối mỡ', category: 'prepared_meal', unit: 'portion', weight: 0.4, img: '/com-ga-hoi-an.png' },
  { title: 'Suất cơm chay từ thiện', category: 'prepared_meal', unit: 'portion', weight: 0.4, img: '/food_lunchbox.png' },
  { title: 'Cơm trưa văn phòng', category: 'prepared_meal', unit: 'portion', weight: 0.5, img: '/food_lunchbox.png' },
  { title: 'Bún/mì xào thập cẩm', category: 'prepared_meal', unit: 'portion', weight: 0.4, img: '/com-ga-hoi-an.png' },
  { title: 'Bánh mì thịt nguội', category: 'bakery', unit: 'item', weight: 0.2, img: '/banh-mi-lua-mach-tuoi.png' },
  { title: 'Bánh mì ngọt thập cẩm', category: 'bakery', unit: 'portion', weight: 0.15, img: '/banh-mi-ngot-thap-cam.png' },
  { title: 'Bánh su kem custard', category: 'bakery', unit: 'portion', weight: 0.08, img: '/banh-su-kem.png' },
  { title: 'Croissant & bánh ngọt', category: 'bakery', unit: 'portion', weight: 0.1, img: '/food_bread.png' },
  { title: 'Rau củ quả cuối ngày', category: 'raw_ingredients', unit: 'kg', weight: 1, img: '/food_salad.png' },
  { title: 'Trái cây tươi thập cẩm', category: 'raw_ingredients', unit: 'kg', weight: 1, img: '/food_salad.png' },
  { title: 'Salad rau trộn', category: 'raw_ingredients', unit: 'portion', weight: 0.3, img: '/food_salad.png' },
  { title: 'Sữa tươi tiệt trùng (cận date)', category: 'beverage', unit: 'box', weight: 1, img: '' },
  { title: 'Nước ép trái cây tươi', category: 'beverage', unit: 'item', weight: 0.4, img: '' },
  { title: 'Nước ngọt đóng chai', category: 'beverage', unit: 'box', weight: 0.5, img: '' },
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const PER_AREA = 4; // 28 area × 4 = 112 listing

async function main() {
  const passwordHash = await bcrypt.hash('Provider123', 12);
  const now = Date.now();
  const d = (n) => new Date(now + n * 86_400_000).toISOString();
  let total = 0;

  for (const a of AREAS) {
    const email = `bulk-${a.slug}@foodresq.vn`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { fullName: a.name, status: 'active' },
      create: { email, passwordHash, fullName: a.name, role: 'provider', status: 'active' },
    });
    let profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.providerProfile.create({
        data: { userId: user.id, businessName: a.name, businessType: a.type, address: `${a.ward}, TP.HCM`, isVerified: true, verificationStatus: 'approved' },
      });
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_profiles SET location = ST_SetSRID(ST_MakePoint(${a.lng},${a.lat}),4326)::geography WHERE id = ${profile.id}::uuid`);

    // Xoá listing cũ chưa có reservation của cửa hàng này (re-run sạch)
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM food_listings fl WHERE fl.provider_id = ${profile.id}::uuid
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.listing_id = fl.id)`);

    const chosen = [...FOODS].sort(() => Math.random() - 0.5).slice(0, PER_AREA);
    for (const f of chosen) {
      const lat = a.lat + rand(-0.012, 0.012);
      const lng = a.lng + rand(-0.012, 0.012);
      const qty = Math.floor(rand(5, 40));
      const maxPer = f.unit === 'kg' || f.unit === 'box' ? 5 : 3;
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO food_listings (
          provider_id, title, category, quantity_total, quantity_remaining, quantity_unit,
          weight_per_unit_kg, pickup_start_time, pickup_end_time, expiry_time,
          pickup_address, pickup_location, max_per_reservation, image_urls,
          status, created_at, updated_at
        ) VALUES (
          ${profile.id}::uuid, ${f.title + ' — ' + a.ward}, ${f.category}::food_category,
          ${qty}, ${qty}, ${f.unit}::quantity_unit, ${f.weight},
          ${d(0)}::timestamptz, ${d(2 + Math.floor(rand(0, 4)))}::timestamptz, ${d(5)}::timestamptz,
          ${a.ward + ', TP.HCM'}, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography,
          ${maxPer}, ${JSON.stringify(f.img ? [f.img] : [])}::jsonb,
          'active'::listing_status, NOW(), NOW())`);
      total++;
    }
    console.log(`✓ ${a.name} (${a.ward}) — ${PER_AREA} món`);
  }

  console.log(`\nDone. ${AREAS.length} cửa hàng, ${total} listing rải khắp TP.HCM.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
