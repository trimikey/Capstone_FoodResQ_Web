/* eslint-disable */
// Seed dữ liệu thật: providers + food_listings quanh trung tâm TP.HCM (106.6297, 10.8231).
// Idempotent: chạy lại nhiều lần không tạo trùng (upsert theo email / xoá listing cũ của provider seed).
// Chạy: node prisma/seed.js   (hoặc: pnpm seed)
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const HCM = { lng: 106.6297, lat: 10.8231 };

// Lệch toạ độ ~vài trăm m → vài km quanh tâm để có distance đa dạng
function near(dLng, dLat) {
  return { lng: HCM.lng + dLng, lat: HCM.lat + dLat };
}

const PROVIDERS = [
  {
    email: 'tiembanhmattroi@foodresq.vn',
    fullName: 'Tiệm Bánh Mặt Trời',
    businessName: 'Tiệm Bánh Mặt Trời',
    businessType: 'bakery',
    address: '12 Phan Văn Trị, Phường 7, Gò Vấp, TP.HCM',
    loc: near(0.004, 0.003),
  },
  {
    email: 'bepnhacolan@foodresq.vn',
    fullName: 'Bếp Nhà Cô Lan',
    businessName: 'Bếp Nhà Cô Lan',
    businessType: 'restaurant',
    address: '45 Nguyễn Thái Sơn, Phường 4, Gò Vấp, TP.HCM',
    loc: near(-0.006, 0.005),
  },
  {
    email: 'sieuthixanh@foodresq.vn',
    fullName: 'Siêu Thị Xanh',
    businessName: 'Siêu Thị Xanh',
    businessType: 'supermarket',
    address: '88 Quang Trung, Phường 10, Gò Vấp, TP.HCM',
    loc: near(0.009, -0.004),
  },
];

// Mỗi listing gắn provider qua index trong PROVIDERS
function listingsFor(now) {
  const h = (n) => new Date(now.getTime() + n * 3600_000).toISOString();
  return [
    {
      p: 0, title: 'Bánh mì ngọt thập cẩm', category: 'bakery',
      qty: 12, unit: 'portion', weight: 0.15, maxPer: 3,
      pickStart: h(0), pickEnd: h(6), expiry: h(8),
      storage: 'Nhiệt độ phòng', allergen: 'Trứng, sữa, gluten',
      images: ['/banh-mi-ngot-thap-cam.png'], dLng: 0.004, dLat: 0.003,
    },
    {
      p: 0, title: 'Bánh mì lúa mạch tươi', category: 'bakery',
      qty: 5, unit: 'portion', weight: 0.3, maxPer: 2,
      pickStart: h(0), pickEnd: h(1.5), expiry: h(3),
      storage: 'Nhiệt độ phòng', allergen: 'Gluten',
      images: ['/banh-mi-lua-mach-tuoi.png'], dLng: 0.0042, dLat: 0.0031,
    },
    {
      p: 0, title: 'Bánh su kem custard', category: 'bakery',
      qty: 15, unit: 'portion', weight: 0.08, maxPer: 4,
      pickStart: h(0), pickEnd: h(8), expiry: h(10),
      storage: 'Tủ lạnh dưới 4°C', allergen: 'Sữa, trứng',
      images: ['/banh-su-kem.png'], dLng: 0.0038, dLat: 0.0028,
    },
    {
      p: 1, title: 'Cơm gà Hội An', category: 'prepared_meal',
      qty: 8, unit: 'portion', weight: 0.4, maxPer: 2,
      pickStart: h(0), pickEnd: h(4), expiry: h(5),
      storage: 'Giữ nóng', allergen: 'Gà, hành tây',
      images: ['/com-ga-hoi-an.png'], dLng: -0.006, dLat: 0.005,
    },
    {
      p: 1, title: 'Suất cơm chay thập cẩm', category: 'prepared_meal',
      qty: 20, unit: 'portion', weight: 0.45, maxPer: 3,
      pickStart: h(0), pickEnd: h(3), expiry: h(4),
      storage: 'Giữ nóng', allergen: 'Đậu nành',
      images: ['/com-ga-hoi-an.png'], dLng: -0.0058, dLat: 0.0052,
    },
    {
      p: 2, title: 'Rau củ quả tươi cuối ngày', category: 'raw_ingredients',
      qty: 30, unit: 'kg', weight: 1, maxPer: 5,
      pickStart: h(0), pickEnd: h(5), expiry: h(12),
      storage: 'Nơi khô ráo, thoáng mát', allergen: null,
      images: [], dLng: 0.009, dLat: -0.004,
    },
    {
      p: 2, title: 'Sữa tươi tiệt trùng (cận date)', category: 'beverage',
      qty: 24, unit: 'box', weight: 1, maxPer: 4,
      pickStart: h(0), pickEnd: h(10), expiry: h(48),
      storage: 'Tủ lạnh', allergen: 'Sữa',
      images: [], dLng: 0.0092, dLat: -0.0042,
    },
  ];
}

async function main() {
  const passwordHash = await bcrypt.hash('Provider123', 12);
  const now = new Date();

  // 1. Upsert provider users + profiles
  const providerIds = [];
  for (const prov of PROVIDERS) {
    const user = await prisma.user.upsert({
      where: { email: prov.email },
      update: { fullName: prov.fullName, status: 'active' },
      create: {
        email: prov.email,
        passwordHash,
        fullName: prov.fullName,
        role: 'provider',
        status: 'active',
      },
    });

    let profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.providerProfile.create({
        data: {
          userId: user.id,
          businessName: prov.businessName,
          businessType: prov.businessType,
          address: prov.address,
          isVerified: true,
          verificationStatus: 'approved',
        },
      });
    }
    // location là cột geography → set qua raw SQL
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_profiles
      SET location = ST_SetSRID(ST_MakePoint(${prov.loc.lng}, ${prov.loc.lat}), 4326)::geography
      WHERE id = ${profile.id}::uuid
    `);
    providerIds.push(profile.id);
    console.log(`✓ provider: ${prov.businessName}`);
  }

  // 2. Xoá listing seed cũ (do các provider seed tạo) để chạy lại không trùng
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM food_listings WHERE provider_id = ANY(${providerIds}::uuid[])
  `);

  // 3. Tạo food listings (active) — pickup_location qua raw SQL
  let count = 0;
  for (const l of listingsFor(now)) {
    const providerId = providerIds[l.p];
    const lng = HCM.lng + l.dLng;
    const lat = HCM.lat + l.dLat;
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO food_listings (
        provider_id, title, category, quantity_total, quantity_remaining, quantity_unit,
        weight_per_unit_kg, pickup_start_time, pickup_end_time, expiry_time,
        pickup_address, pickup_location, storage_conditions, allergen_notes,
        max_per_reservation, image_urls, status, created_at, updated_at
      ) VALUES (
        ${providerId}::uuid, ${l.title}, ${l.category}::food_category,
        ${l.qty}, ${l.qty}, ${l.unit}::quantity_unit,
        ${l.weight}, ${l.pickStart}::timestamptz, ${l.pickEnd}::timestamptz, ${l.expiry}::timestamptz,
        ${PROVIDERS[l.p].address},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${l.storage}, ${l.allergen},
        ${l.maxPer}, ${JSON.stringify(l.images)}::jsonb,
        'active'::listing_status, NOW(), NOW()
      )
    `);
    count++;
    console.log(`  · listing: ${l.title}`);
  }

  console.log(`\nDone. ${PROVIDERS.length} providers, ${count} active listings.`);
  console.log('Provider login: <email>@foodresq.vn / Provider123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
