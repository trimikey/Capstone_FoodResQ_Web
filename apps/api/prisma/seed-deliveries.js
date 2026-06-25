/* eslint-disable */
// Seed đơn giao hàng cho shipper demo: cấp chuyên môn shipper + tạo các đơn đặt có giao,
// rải địa điểm giao khắp TP.HCM, gửi lời mời (offer) cho shipper.
// Idempotent: làm mới hạn offer đang có, chỉ tạo bù cho đủ DESIRED.
// Chạy: node prisma/seed-deliveries.js
const { PrismaClient, Prisma } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

const SHIPPER_EMAIL = process.env.SHIPPER_EMAIL || 'shipper1@gmail.com';
const DESIRED = 4;
const SHIPPER_HOME = { lng: 106.6297, lat: 10.8231 }; // tâm HCM

// Địa điểm giao rải khắp HCM ("giao mọi nơi") — kèm tên người nhận cụ thể
const DROPS = [
  { who: 'Cô Năm - Quận 1', lng: 106.700, lat: 10.776 },
  { who: 'Anh Hùng - TP. Thủ Đức', lng: 106.770, lat: 10.851 },
  { who: 'Bà Tư - Gò Vấp', lng: 106.665, lat: 10.838 },
  { who: 'Chú Ba - Bình Thạnh', lng: 106.712, lat: 10.804 },
  { who: 'Em Lan - Quận 7', lng: 106.722, lat: 10.738 },
];

const qr = () => crypto.randomBytes(32).toString('hex'); // 64 hex chars

async function main() {
  // 1) Shipper: hồ sơ + sẵn sàng + chuyên môn shipper đã xác minh
  const user = await prisma.user.findUnique({ where: { email: SHIPPER_EMAIL } });
  if (!user) throw new Error(`Không tìm thấy user ${SHIPPER_EMAIL}`);

  let vp = await prisma.volunteerProfile.findUnique({ where: { userId: user.id } });
  if (!vp) {
    vp = await prisma.volunteerProfile.create({ data: { userId: user.id, isAvailable: true, verificationStatus: 'approved' } });
  } else {
    await prisma.volunteerProfile.update({ where: { id: vp.id }, data: { isAvailable: true, verificationStatus: 'approved' } });
  }
  await prisma.$executeRaw(Prisma.sql`
    UPDATE volunteer_profiles
    SET current_location = ST_SetSRID(ST_MakePoint(${SHIPPER_HOME.lng}, ${SHIPPER_HOME.lat}), 4326)::geography,
        location_updated_at = NOW(), is_available = TRUE
    WHERE id = ${vp.id}::uuid`);

  const existedSpec = await prisma.volunteerSpecializationEntry.findUnique({
    where: { volunteerId_specialization: { volunteerId: vp.id, specialization: 'shipper' } },
  }).catch(() => null);
  if (existedSpec) {
    await prisma.volunteerSpecializationEntry.update({ where: { id: existedSpec.id }, data: { isVerified: true, verifiedAt: new Date() } });
  } else {
    await prisma.volunteerSpecializationEntry.create({
      data: { volunteerId: vp.id, specialization: 'shipper', isVerified: true, verifiedAt: new Date() },
    });
  }
  console.log('✓ shipper sẵn sàng + chuyên môn shipper (verified):', SHIPPER_EMAIL);

  // 2) Làm mới hạn các offer đang chờ → không bị hết hạn khi demo
  const refreshed = await prisma.$executeRaw(Prisma.sql`
    UPDATE shipper_task_offers SET expires_at = NOW() + INTERVAL '1 day'
    WHERE shipper_id = ${vp.id}::uuid AND status = 'pending'`);
  const pendingNow = await prisma.shipperTaskOffer.count({ where: { shipperId: vp.id, status: 'pending', expiresAt: { gt: new Date() } } });
  console.log(`↻ làm mới ${refreshed} offer; hiện có ${pendingNow} offer chờ.`);

  const need = Math.max(0, DESIRED - pendingNow);
  if (need === 0) {
    console.log('Đã đủ đơn giao demo.');
    return;
  }

  // 3) Nguyên liệu: listing active + receiver có sẵn
  const listings = await prisma.$queryRawUnsafe(
    `SELECT id, title, ST_X(pickup_location::geometry) lng, ST_Y(pickup_location::geometry) lat
     FROM food_listings WHERE status='active' AND deleted_at IS NULL AND pickup_location IS NOT NULL LIMIT 10`,
  );
  if (listings.length === 0) throw new Error('Không có listing active để tạo đơn.');
  const receivers = await prisma.receiverProfile.findMany({ where: { isCharityOrg: false }, select: { id: true }, take: 10 });
  if (receivers.length === 0) throw new Error('Không có receiver để đặt đơn.');

  let created = 0;
  for (let i = 0; i < need; i++) {
    const listing = listings[i % listings.length];
    const receiver = receivers[i % receivers.length];
    const drop = DROPS[i % DROPS.length];
    const distanceKm = Math.round(Math.random() * 50 + 10) / 10; // ~1.0–6.0 km (vẫn đa dạng dù random vì chỉ là minh hoạ)

    await prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw(Prisma.sql`
        INSERT INTO reservations (listing_id, receiver_id, quantity, status, qr_token, qr_expires_at, receiver_notes, created_at, updated_at)
        VALUES (${listing.id}::uuid, ${receiver.id}::uuid, 1, 'confirmed'::reservation_status, ${qr()},
                NOW() + INTERVAL '30 min', ${'[seed-delivery] Giao tới ' + drop.who}, NOW(), NOW())
        RETURNING id`);
      const [d] = await tx.$queryRaw(Prisma.sql`
        INSERT INTO deliveries (reservation_id, status, pickup_location, delivery_location, distance_km, created_at, updated_at)
        VALUES (${r.id}::uuid, 'pending_assignment'::delivery_status,
                ST_SetSRID(ST_MakePoint(${listing.lng}, ${listing.lat}), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${drop.lng}, ${drop.lat}), 4326)::geography,
                ${distanceKm}, NOW(), NOW())
        RETURNING id`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO shipper_task_offers (delivery_id, shipper_id, status, expires_at, offered_at)
        VALUES (${d.id}::uuid, ${vp.id}::uuid, 'pending'::offer_status, NOW() + INTERVAL '1 day', NOW())`);
    });
    created++;
    console.log(`  · đơn giao "${listing.title}" → ${drop.who}`);
  }
  console.log(`\nDone. Tạo ${created} đơn giao mới. Đăng nhập ${SHIPPER_EMAIL} → trang Giao hàng để nhận.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
