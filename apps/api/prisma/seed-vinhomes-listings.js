/* eslint-disable */
// Seed listing test quanh Vinhomes Grand Park bằng các provider account đã có.
// Idempotent: chạy lại sẽ refresh số lượng, vị trí và thời hạn tới DB NOW() + 2 days.
// Chạy từ apps/api: node prisma/seed-vinhomes-listings.js
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

const VINHOMES = { lat: 10.8416, lng: 106.8370 };
const PROVIDERS = [
  {
    email: 'bulk-grandpark@foodresq.vn',
    businessName: 'Quán Ăn Grand Park',
    address: 'S1.02 Vinhomes Grand Park, Long Bình, TP. Thủ Đức',
    lat: 10.8422,
    lng: 106.8378,
  },
  {
    email: 'bulk-nguyenxien@foodresq.vn',
    businessName: 'Siêu Thị Nguyễn Xiển',
    address: 'Nguyễn Xiển, Long Bình, TP. Thủ Đức',
    lat: 10.8455,
    lng: 106.8352,
  },
  {
    email: 'bulk-longbinh@foodresq.vn',
    businessName: 'Bếp Long Bình',
    address: 'Đường Phước Thiện, Long Bình, TP. Thủ Đức',
    lat: 10.8388,
    lng: 106.8406,
  },
  {
    email: 'bulk-longthanhmy@foodresq.vn',
    businessName: 'Vựa Trái Cây Long Thạnh Mỹ',
    address: 'Hoàng Hữu Nam, Long Thạnh Mỹ, TP. Thủ Đức',
    lat: 10.8474,
    lng: 106.8329,
  },
];

const LISTINGS = [
  {
    providerEmail: 'bulk-grandpark@foodresq.vn',
    title: 'Vinhomes test - Cơm gà xé hộp',
    description: 'Suất cơm gà xé đóng hộp còn mới, phù hợp nhận trong ngày.',
    category: 'cooked_meal',
    qty: 18,
    unit: 'portion',
    weight: 0.45,
    maxPer: 3,
    storage: 'Giữ mát, hâm nóng trước khi dùng',
    allergen: 'Gà, nước mắm',
    images: ['/com-ga-hoi-an.png'],
    lat: 10.8421,
    lng: 106.8375,
    address: 'S1.02 Vinhomes Grand Park, Long Bình, TP. Thủ Đức',
  },
  {
    providerEmail: 'bulk-grandpark@foodresq.vn',
    title: 'Vinhomes test - Bánh mì thịt nguội',
    description: 'Bánh mì đã đóng gói riêng, còn hạn sử dụng tới ngày mốt.',
    category: 'bakery',
    qty: 24,
    unit: 'item',
    weight: 0.2,
    maxPer: 4,
    storage: 'Nhiệt độ phòng',
    allergen: 'Gluten, thịt nguội',
    images: ['/banh-mi-lua-mach-tuoi.png'],
    lat: 10.8426,
    lng: 106.8369,
    address: 'S2.01 Vinhomes Grand Park, Long Bình, TP. Thủ Đức',
  },
  {
    providerEmail: 'bulk-nguyenxien@foodresq.vn',
    title: 'Vinhomes test - Rau củ nấu canh',
    description: 'Rau củ tươi cuối ngày từ quầy siêu thị, đã phân loại.',
    category: 'vegetables',
    qty: 32,
    unit: 'kg',
    weight: 1,
    maxPer: 6,
    storage: 'Nơi thoáng mát',
    allergen: null,
    images: ['/food_salad.png'],
    lat: 10.8452,
    lng: 106.8357,
    address: 'Siêu thị Nguyễn Xiển, Long Bình, TP. Thủ Đức',
  },
  {
    providerEmail: 'bulk-longbinh@foodresq.vn',
    title: 'Vinhomes test - Cháo dinh dưỡng',
    description: 'Cháo nấu trong ngày, đóng thùng giữ nhiệt cho bếp ăn cộng đồng.',
    category: 'cooked_meal',
    qty: 40,
    unit: 'portion',
    weight: 0.35,
    maxPer: 8,
    storage: 'Giữ nóng',
    allergen: 'Thịt heo',
    images: [],
    lat: 10.8391,
    lng: 106.8401,
    address: 'Bếp Long Bình, Phước Thiện, TP. Thủ Đức',
  },
  {
    providerEmail: 'bulk-longthanhmy@foodresq.vn',
    title: 'Vinhomes test - Chuối và táo thập cẩm',
    description: 'Trái cây còn tốt, phù hợp chia phần cho điểm phát cơm.',
    category: 'fresh_fruit',
    qty: 26,
    unit: 'kg',
    weight: 1,
    maxPer: 5,
    storage: 'Nơi khô ráo, thoáng mát',
    allergen: null,
    images: ['/food_salad.png'],
    lat: 10.8470,
    lng: 106.8335,
    address: 'Vựa trái cây Long Thạnh Mỹ, TP. Thủ Đức',
  },
];

async function main() {
  const existingProviders = await prisma.providerProfile.findMany({
    where: { user: { email: { in: PROVIDERS.map((p) => p.email) } } },
    include: { user: { select: { email: true, status: true } } },
  });
  const providerByEmail = new Map(existingProviders.map((p) => [p.user.email, p]));

  const missing = PROVIDERS.filter((p) => !providerByEmail.has(p.email));
  if (missing.length) {
    throw new Error(`Thiếu provider account có sẵn: ${missing.map((p) => p.email).join(', ')}`);
  }

  for (const p of PROVIDERS) {
    const profile = providerByEmail.get(p.email);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_profiles
      SET business_name = ${p.businessName},
          address = ${p.address},
          is_verified = true,
          verification_status = 'approved',
          location = ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
          updated_at = NOW()
      WHERE id = ${profile.id}::uuid
    `);
  }

  let created = 0;
  let refreshed = 0;
  for (const item of LISTINGS) {
    const provider = providerByEmail.get(item.providerEmail);
    const dup = await prisma.foodListing.findFirst({
      where: { providerId: provider.id, title: item.title },
      select: { id: true },
    });

    if (dup) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE food_listings
        SET description = ${item.description},
            category = ${item.category}::food_category,
            quantity_total = ${item.qty},
            quantity_remaining = ${item.qty},
            quantity_unit = ${item.unit}::quantity_unit,
            weight_per_unit_kg = ${item.weight},
            pickup_start_time = NOW(),
            pickup_end_time = NOW() + INTERVAL '2 days',
            expiry_time = NOW() + INTERVAL '2 days',
            pickup_address = ${item.address},
            pickup_location = ST_SetSRID(ST_MakePoint(${item.lng}, ${item.lat}), 4326)::geography,
            storage_conditions = ${item.storage},
            allergen_notes = ${item.allergen},
            max_per_reservation = ${item.maxPer},
            image_urls = ${JSON.stringify(item.images)}::jsonb,
            status = 'active'::listing_status,
            cancelled_reason = NULL,
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = ${dup.id}::uuid
      `);
      refreshed++;
      continue;
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO food_listings (
        provider_id, title, description, category, quantity_total, quantity_remaining,
        quantity_unit, weight_per_unit_kg, pickup_start_time, pickup_end_time,
        expiry_time, pickup_address, pickup_location, storage_conditions,
        allergen_notes, max_per_reservation, image_urls, is_surprise_bag,
        status, created_at, updated_at
      ) VALUES (
        ${provider.id}::uuid, ${item.title}, ${item.description},
        ${item.category}::food_category, ${item.qty}, ${item.qty},
        ${item.unit}::quantity_unit, ${item.weight}, NOW(), NOW() + INTERVAL '2 days',
        NOW() + INTERVAL '2 days', ${item.address},
        ST_SetSRID(ST_MakePoint(${item.lng}, ${item.lat}), 4326)::geography,
        ${item.storage}, ${item.allergen}, ${item.maxPer},
        ${JSON.stringify(item.images)}::jsonb, false, 'active'::listing_status,
        NOW(), NOW()
      )
    `);
    created++;
  }

  const nearby = await prisma.$queryRaw(Prisma.sql`
    SELECT fl.title, pp.business_name, fl.quantity_remaining, fl.quantity_unit,
           fl.pickup_end_time,
           ROUND(ST_Distance(
             fl.pickup_location::geography,
             ST_MakePoint(${VINHOMES.lng}, ${VINHOMES.lat})::geography
           ))::int AS distance_m
    FROM food_listings fl
    JOIN provider_profiles pp ON pp.id = fl.provider_id
    WHERE fl.title LIKE 'Vinhomes test - %'
      AND fl.status = 'active'::listing_status
      AND fl.deleted_at IS NULL
    ORDER BY distance_m ASC
  `);

  console.log(`Done. ${created} created, ${refreshed} refreshed.`);
  console.table(nearby.map((row) => ({
    title: row.title,
    provider: row.business_name,
    qty: `${Number(row.quantity_remaining)} ${row.quantity_unit}`,
    distanceM: Number(row.distance_m),
    pickupEnd: row.pickup_end_time,
  })));
}

main()
  .catch((e) => {
    console.error('Seed Vinhomes listings failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
