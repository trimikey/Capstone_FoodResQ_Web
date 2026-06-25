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
  {
    email: 'nhahangsen@foodresq.vn',
    fullName: 'Nhà Hàng Sen Việt',
    businessName: 'Nhà Hàng Sen Việt',
    businessType: 'restaurant',
    address: '210 Lê Quang Định, Phường 11, Bình Thạnh, TP.HCM',
    loc: near(-0.008, -0.003),
  },
  {
    email: 'kháchsanmai@foodresq.vn',
    fullName: 'Khách Sạn Hoa Mai',
    businessName: 'Khách Sạn Hoa Mai',
    businessType: 'hotel',
    address: '5 Phạm Ngũ Lão, Quận 1, TP.HCM',
    loc: near(0.012, 0.006),
  },
];

// Mỗi listing gắn provider qua index trong PROVIDERS.
// Khung thời gian tính theo NGÀY để listing không hết hạn nhanh trong lúc demo/dev.
function listingsFor(now) {
  const h = (n) => new Date(now.getTime() + n * 3600_000).toISOString();
  const d = (n) => new Date(now.getTime() + n * 86_400_000).toISOString();
  return [
    {
      p: 0, title: 'Bánh mì ngọt thập cẩm', category: 'bakery',
      qty: 12, unit: 'portion', weight: 0.15, maxPer: 3,
      pickStart: h(0), pickEnd: d(3), expiry: d(4),
      storage: 'Nhiệt độ phòng', allergen: 'Trứng, sữa, gluten',
      images: ['/banh-mi-ngot-thap-cam.png'], dLng: 0.004, dLat: 0.003,
    },
    {
      p: 0, title: 'Bánh mì lúa mạch tươi', category: 'bakery',
      qty: 5, unit: 'portion', weight: 0.3, maxPer: 2,
      pickStart: h(0), pickEnd: h(2), expiry: d(1),
      storage: 'Nhiệt độ phòng', allergen: 'Gluten',
      images: ['/banh-mi-lua-mach-tuoi.png'], dLng: 0.0042, dLat: 0.0031,
    },
    {
      p: 0, title: 'Bánh su kem custard', category: 'bakery',
      qty: 15, unit: 'portion', weight: 0.08, maxPer: 4,
      pickStart: h(0), pickEnd: d(2), expiry: d(3),
      storage: 'Tủ lạnh dưới 4°C', allergen: 'Sữa, trứng',
      images: ['/banh-su-kem.png'], dLng: 0.0038, dLat: 0.0028,
    },
    {
      p: 1, title: 'Cơm gà Hội An', category: 'cooked_meal',
      qty: 8, unit: 'portion', weight: 0.4, maxPer: 2,
      pickStart: h(0), pickEnd: d(2), expiry: d(2),
      storage: 'Giữ nóng', allergen: 'Gà, hành tây',
      images: ['/com-ga-hoi-an.png'], dLng: -0.006, dLat: 0.005,
    },
    {
      p: 1, title: 'Suất cơm chay thập cẩm', category: 'cooked_meal',
      qty: 20, unit: 'portion', weight: 0.45, maxPer: 3,
      pickStart: h(0), pickEnd: d(2), expiry: d(2),
      storage: 'Giữ nóng', allergen: 'Đậu nành',
      images: ['/com-ga-hoi-an.png'], dLng: -0.0058, dLat: 0.0052,
    },
    {
      p: 2, title: 'Rau củ quả tươi cuối ngày', category: 'vegetables',
      qty: 30, unit: 'kg', weight: 1, maxPer: 5,
      pickStart: h(0), pickEnd: d(3), expiry: d(5),
      storage: 'Nơi khô ráo, thoáng mát', allergen: null,
      images: [], dLng: 0.009, dLat: -0.004,
    },
    {
      p: 2, title: 'Sữa tươi tiệt trùng (cận date)', category: 'beverage',
      qty: 24, unit: 'box', weight: 1, maxPer: 4,
      pickStart: h(0), pickEnd: d(5), expiry: d(7),
      storage: 'Tủ lạnh', allergen: 'Sữa',
      images: [], dLng: 0.0092, dLat: -0.0042,
    },
    // Nhà Hàng Sen Việt (index 3)
    {
      p: 3, title: 'Bún chả Hà Nội', category: 'cooked_meal',
      qty: 15, unit: 'portion', weight: 0.5, maxPer: 2,
      pickStart: h(0), pickEnd: d(2), expiry: d(2),
      storage: 'Giữ nóng', allergen: 'Thịt heo, mắm tôm',
      images: ['/com-ga-hoi-an.png'], dLng: -0.008, dLat: -0.003,
    },
    {
      p: 3, title: 'Gỏi cuốn tôm thịt', category: 'cooked_meal',
      qty: 25, unit: 'item', weight: 0.1, maxPer: 5,
      pickStart: h(0), pickEnd: d(1), expiry: d(1),
      storage: 'Tủ mát', allergen: 'Tôm',
      images: ['/food_salad.png'], dLng: -0.0082, dLat: -0.0032,
    },
    // Khách Sạn Hoa Mai (index 4)
    {
      p: 4, title: 'Buffet sáng dư (bánh & trái cây)', category: 'bakery',
      qty: 18, unit: 'portion', weight: 0.25, maxPer: 3,
      pickStart: h(0), pickEnd: d(1), expiry: d(2),
      storage: 'Nhiệt độ phòng', allergen: 'Gluten, sữa',
      images: ['/food_bread.png'], dLng: 0.012, dLat: 0.006,
    },
    {
      p: 4, title: 'Nước ép trái cây tươi', category: 'beverage',
      qty: 30, unit: 'box', weight: 0.35, maxPer: 4,
      pickStart: h(0), pickEnd: d(1), expiry: d(2),
      storage: 'Tủ lạnh', allergen: null,
      images: [], dLng: 0.0122, dLat: 0.0062,
    },
  ];
}

async function main() {
  const passwordHash = await bcrypt.hash('Provider123', 12);
  const now = new Date();

  // 0. Admin user
  await prisma.user.upsert({
    where: { email: 'admin@foodresq.vn' },
    update: { status: 'active', role: 'admin' },
    create: {
      email: 'admin@foodresq.vn',
      passwordHash,
      fullName: 'Quản trị viên FoodResQ',
      role: 'admin',
      status: 'active',
    },
  });
  console.log('✓ admin: admin@foodresq.vn');

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

  // 2. Dọn listing seed CHƯA có reservation (tránh vỡ FK + tránh trùng khi chạy lại).
  //    Listing đã có reservation được giữ nguyên để không phá lịch sử.
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM food_listings fl
    WHERE fl.provider_id = ANY(${providerIds}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.listing_id = fl.id)
  `);

  // 3. Tạo/làm mới food listings. Nếu provider đã có listing cùng tiêu đề thì REFRESH
  //    (gia hạn thời gian + active lại + khôi phục số lượng) để không bị hết hạn khi chạy lại.
  let created = 0;
  let refreshed = 0;
  for (const l of listingsFor(now)) {
    const providerId = providerIds[l.p];
    const lng = HCM.lng + l.dLng;
    const lat = HCM.lat + l.dLat;
    const dup = await prisma.foodListing.findFirst({
      where: { providerId, title: l.title },
      select: { id: true },
    });

    if (dup) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE food_listings
        SET pickup_start_time = ${l.pickStart}::timestamptz,
            pickup_end_time = ${l.pickEnd}::timestamptz,
            expiry_time = ${l.expiry}::timestamptz,
            quantity_remaining = ${l.qty},
            quantity_total = ${l.qty},
            status = 'active'::listing_status,
            pickup_location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            updated_at = NOW()
        WHERE id = ${dup.id}::uuid
      `);
      refreshed++;
      console.log(`  ↻ refresh: ${l.title}`);
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
        ${l.qty}, ${l.qty}, ${l.unit}::quantity_unit,
        ${l.weight}, ${l.pickStart}::timestamptz, ${l.pickEnd}::timestamptz, ${l.expiry}::timestamptz,
        ${PROVIDERS[l.p].address},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${l.storage}, ${l.allergen},
        ${l.maxPer}, ${JSON.stringify(l.images)}::jsonb,
        'active'::listing_status, NOW(), NOW()
      )
    `);
    created++;
    console.log(`  · listing: ${l.title}`);
  }
  const count = created + refreshed;

  // 4. Shippers (volunteer + shipper specialization verified + available + location near HCM)
  const SHIPPERS = [
    { email: 'shipper1@foodresq.vn', fullName: 'Trần Minh Tâm', vehicle: 'Xe máy', plate: '59X1-123.45', dLng: 0.002, dLat: 0.001 },
    { email: 'shipper2@foodresq.vn', fullName: 'Lê Hoàng Nam', vehicle: 'Xe máy', plate: '59P2-678.90', dLng: -0.003, dLat: 0.002 },
  ];
  for (const sh of SHIPPERS) {
    const user = await prisma.user.upsert({
      where: { email: sh.email },
      update: { fullName: sh.fullName, status: 'active' },
      create: {
        email: sh.email,
        passwordHash,
        fullName: sh.fullName,
        role: 'volunteer',
        status: 'active',
        phone: null,
      },
    });

    let vp = await prisma.volunteerProfile.findUnique({ where: { userId: user.id } });
    if (!vp) {
      vp = await prisma.volunteerProfile.create({
        data: {
          userId: user.id,
          vehicleType: sh.vehicle,
          vehiclePlate: sh.plate,
          isAvailable: true,
          verificationStatus: 'approved',
        },
      });
    } else {
      await prisma.volunteerProfile.update({
        where: { id: vp.id },
        data: { isAvailable: true, verificationStatus: 'approved', vehicleType: sh.vehicle, vehiclePlate: sh.plate },
      });
    }

    // Chuyên môn shipper đã xác minh
    await prisma.volunteerSpecializationEntry.upsert({
      where: { volunteerId_specialization: { volunteerId: vp.id, specialization: 'shipper' } },
      update: { isVerified: true },
      create: { volunteerId: vp.id, specialization: 'shipper', isVerified: true },
    });

    // Vị trí hiện tại (geography) qua raw SQL
    await prisma.$executeRaw(Prisma.sql`
      UPDATE volunteer_profiles
      SET current_location = ST_SetSRID(ST_MakePoint(${HCM.lng + sh.dLng}, ${HCM.lat + sh.dLat}), 4326)::geography,
          location_updated_at = NOW()
      WHERE id = ${vp.id}::uuid
    `);
    console.log(`✓ shipper: ${sh.fullName}`);
  }

  console.log(`\nDone. ${PROVIDERS.length} providers, ${count} active listings, ${SHIPPERS.length} shippers.`);
  console.log('Provider login: <email>@foodresq.vn / Provider123');
  console.log('Shipper login:  shipper1@foodresq.vn / Provider123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
