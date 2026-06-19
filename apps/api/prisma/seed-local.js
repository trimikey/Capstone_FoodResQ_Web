/* eslint-disable */
// Seed cụm nhà hàng quanh MỘT toạ độ cụ thể (mặc định: Đông Thạnh, Hóc Môn).
// Dùng khi muốn có data ngay tại vị trí GPS thật của người dùng.
// Chỉnh CENTER nếu lệch, rồi chạy lại: node prisma/seed-local.js
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// 📍 Tâm khu vực — Long Bình, TP. Thủ Đức (Nguyễn Xiển / Phước Thiện, gần Vinhomes Grand Park)
const CENTER = { lat: 10.8505, lng: 106.8390 };
// ~0.009 độ ≈ 1km. Rải listing trong bán kính ~1.5km quanh tâm.

const PROVIDERS = [
  {
    email: 'tiembanhlongbinh@foodresq.vn',
    businessName: 'Tiệm Bánh Long Bình',
    businessType: 'bakery',
    address: '12 Nguyễn Xiển, Long Bình, TP. Thủ Đức',
    dLat: 0.004, dLng: 0.003,
  },
  {
    email: 'comphuocthien@foodresq.vn',
    businessName: 'Quán Cơm Phước Thiện',
    businessType: 'restaurant',
    address: '88 Phước Thiện, Long Bình, TP. Thủ Đức',
    dLat: -0.005, dLng: 0.006,
  },
  {
    email: 'sieuthigrandpark@foodresq.vn',
    businessName: 'Siêu Thị Mini Grand Park',
    businessType: 'supermarket',
    address: 'Masteri Center, Vinhomes Grand Park, TP. Thủ Đức',
    dLat: 0.007, dLng: -0.004,
  },
  {
    email: 'vuatraicaythuduc@foodresq.vn',
    businessName: 'Vựa Trái Cây Thủ Đức',
    businessType: 'other',
    address: '15 Hoàng Hữu Nam, Long Bình, TP. Thủ Đức',
    dLat: -0.003, dLng: -0.005,
  },
  {
    email: 'quannuoclongbinh@foodresq.vn',
    businessName: 'Quán Nước Long Bình',
    businessType: 'other',
    address: '60 Đường số 33, Long Bình, TP. Thủ Đức',
    dLat: 0.002, dLng: 0.008,
  },
  {
    email: 'lobanhmibanam@foodresq.vn',
    businessName: 'Lò Bánh Mì Bà Năm',
    businessType: 'bakery',
    address: '5 Nguyễn Xiển, Long Bình, TP. Thủ Đức',
    dLat: -0.006, dLng: -0.002,
  },
];

function listings(now) {
  const h = (n) => new Date(now.getTime() + n * 3600_000).toISOString();
  const d = (n) => new Date(now.getTime() + n * 86_400_000).toISOString();
  return [
    { p: 0, title: 'Bánh mì bơ tỏi Long Bình', category: 'bakery', qty: 14, unit: 'portion', weight: 0.12, maxPer: 3, pickStart: h(0), pickEnd: d(2), expiry: d(3), storage: 'Nhiệt độ phòng', allergen: 'Gluten, sữa', images: ['/banh-mi-ngot-thap-cam.png'], dLat: 0.004, dLng: 0.003 },
    { p: 0, title: 'Bánh su kem Long Bình', category: 'bakery', qty: 18, unit: 'portion', weight: 0.08, maxPer: 4, pickStart: h(0), pickEnd: d(1), expiry: d(2), storage: 'Tủ lạnh', allergen: 'Trứng, sữa', images: ['/banh-su-kem.png'], dLat: 0.0042, dLng: 0.0028 },
    { p: 1, title: 'Cơm tấm sườn dư trưa', category: 'prepared_meal', qty: 12, unit: 'portion', weight: 0.45, maxPer: 2, pickStart: h(0), pickEnd: d(1), expiry: d(1), storage: 'Giữ nóng', allergen: 'Trứng', images: ['/com-ga-hoi-an.png'], dLat: -0.005, dLng: 0.006 },
    { p: 1, title: 'Suất cơm chay từ thiện', category: 'prepared_meal', qty: 25, unit: 'portion', weight: 0.4, maxPer: 3, pickStart: h(0), pickEnd: d(1), expiry: d(1), storage: 'Giữ nóng', allergen: 'Đậu nành', images: ['/com-ga-hoi-an.png'], dLat: -0.0052, dLng: 0.0062 },
    { p: 2, title: 'Rau củ Đà Lạt cuối ngày', category: 'raw_ingredients', qty: 28, unit: 'kg', weight: 1, maxPer: 5, pickStart: h(0), pickEnd: d(2), expiry: d(4), storage: 'Nơi thoáng mát', allergen: null, images: [], dLat: 0.007, dLng: -0.004 },
    { p: 2, title: 'Sữa tươi cận date', category: 'beverage', qty: 30, unit: 'box', weight: 1, maxPer: 4, pickStart: h(0), pickEnd: d(3), expiry: d(6), storage: 'Tủ lạnh', allergen: 'Sữa', images: [], dLat: 0.0072, dLng: -0.0042 },

    // Vựa Trái Cây Hóc Môn (index 3)
    { p: 3, title: 'Trái cây tươi thập cẩm', category: 'raw_ingredients', qty: 20, unit: 'kg', weight: 1, maxPer: 3, pickStart: h(0), pickEnd: d(1), expiry: d(2), storage: 'Nơi thoáng mát', allergen: null, images: ['/food_salad.png'], dLat: -0.003, dLng: -0.005 },
    { p: 3, title: 'Chuối & táo cuối ngày', category: 'raw_ingredients', qty: 15, unit: 'kg', weight: 1, maxPer: 3, pickStart: h(0), pickEnd: d(1), expiry: d(2), storage: 'Nơi thoáng mát', allergen: null, images: ['/food_salad.png'], dLat: -0.0032, dLng: -0.0052 },

    // Quán Nước Đông Thạnh (index 4)
    { p: 4, title: 'Nước ngọt đóng chai (cận date)', category: 'beverage', qty: 40, unit: 'box', weight: 0.5, maxPer: 6, pickStart: h(0), pickEnd: d(2), expiry: d(5), storage: 'Nơi thoáng mát', allergen: null, images: [], dLat: 0.002, dLng: 0.008 },
    { p: 4, title: 'Nước ép cam tươi', category: 'beverage', qty: 24, unit: 'item', weight: 0.4, maxPer: 4, pickStart: h(0), pickEnd: d(1), expiry: d(1), storage: 'Tủ lạnh', allergen: null, images: [], dLat: 0.0022, dLng: 0.0082 },

    // Lò Bánh Mì Bà Năm (index 5)
    { p: 5, title: 'Bánh mì thịt nguội', category: 'bakery', qty: 22, unit: 'item', weight: 0.2, maxPer: 4, pickStart: h(0), pickEnd: h(8), expiry: d(1), storage: 'Nhiệt độ phòng', allergen: 'Gluten, thịt', images: ['/banh-mi-lua-mach-tuoi.png'], dLat: -0.006, dLng: -0.002 },
    { p: 5, title: 'Bánh mì không (ổ)', category: 'bakery', qty: 35, unit: 'item', weight: 0.15, maxPer: 6, pickStart: h(0), pickEnd: d(1), expiry: d(2), storage: 'Nhiệt độ phòng', allergen: 'Gluten', images: ['/banh-mi-ngot-thap-cam.png'], dLat: -0.0062, dLng: -0.0022 },
    { p: 5, title: 'Bánh ngọt các loại', category: 'bakery', qty: 18, unit: 'portion', weight: 0.1, maxPer: 4, pickStart: h(0), pickEnd: d(1), expiry: d(2), storage: 'Tủ mát', allergen: 'Trứng, sữa, gluten', images: ['/banh-su-kem.png'], dLat: -0.0058, dLng: -0.0018 },
  ];
}

async function main() {
  const passwordHash = await bcrypt.hash('Provider123', 12);
  const now = new Date();
  const providerIds = [];

  for (const prov of PROVIDERS) {
    const user = await prisma.user.upsert({
      where: { email: prov.email },
      update: { fullName: prov.businessName, status: 'active' },
      create: { email: prov.email, passwordHash, fullName: prov.businessName, role: 'provider', status: 'active' },
    });
    let profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.providerProfile.create({
        data: { userId: user.id, businessName: prov.businessName, businessType: prov.businessType, address: prov.address, isVerified: true, verificationStatus: 'approved' },
      });
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_profiles
      SET location = ST_SetSRID(ST_MakePoint(${CENTER.lng + prov.dLng}, ${CENTER.lat + prov.dLat}), 4326)::geography
      WHERE id = ${profile.id}::uuid
    `);
    providerIds.push(profile.id);
    console.log('✓ provider:', prov.businessName);
  }

  let created = 0, refreshed = 0;
  for (const l of listings(now)) {
    const providerId = providerIds[l.p];
    const lng = CENTER.lng + l.dLng;
    const lat = CENTER.lat + l.dLat;
    const dup = await prisma.foodListing.findFirst({ where: { providerId, title: l.title }, select: { id: true } });
    if (dup) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE food_listings
        SET pickup_start_time=${l.pickStart}::timestamptz, pickup_end_time=${l.pickEnd}::timestamptz, expiry_time=${l.expiry}::timestamptz,
            quantity_remaining=${l.qty}, quantity_total=${l.qty}, status='active'::listing_status,
            pickup_location=ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, updated_at=NOW()
        WHERE id=${dup.id}::uuid`);
      refreshed++;
      continue;
    }
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO food_listings (
        provider_id, title, category, quantity_total, quantity_remaining, quantity_unit,
        weight_per_unit_kg, pickup_start_time, pickup_end_time, expiry_time,
        pickup_address, pickup_location, storage_conditions, allergen_notes,
        max_per_reservation, image_urls, status, created_at, updated_at
      ) VALUES (
        ${providerId}::uuid, ${l.title}, ${l.category}::food_category,
        ${l.qty}, ${l.qty}, ${l.unit}::quantity_unit, ${l.weight},
        ${l.pickStart}::timestamptz, ${l.pickEnd}::timestamptz, ${l.expiry}::timestamptz,
        ${PROVIDERS[l.p].address}, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography,
        ${l.storage}, ${l.allergen}, ${l.maxPer}, ${JSON.stringify(l.images)}::jsonb,
        'active'::listing_status, NOW(), NOW())`);
    created++;
    console.log('  · listing:', l.title);
  }

  console.log(`\nDone @ (${CENTER.lat}, ${CENTER.lng}). ${PROVIDERS.length} providers, ${created} created / ${refreshed} refreshed.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
