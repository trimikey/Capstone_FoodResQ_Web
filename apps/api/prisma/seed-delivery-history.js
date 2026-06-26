/* eslint-disable */
// Seed LỊCH SỬ giao hàng cho shipper demo: tạo các đơn đã 'delivered' / 'failed' trong quá khứ.
// Idempotent: bỏ qua nếu đã có đủ lịch sử. Chạy: node prisma/seed-delivery-history.js
const { PrismaClient, Prisma } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

const SHIPPER_EMAIL = process.env.SHIPPER_EMAIL || 'shipper1@gmail.com';
const DESIRED = 5;

// Đơn lịch sử: rải địa điểm + trạng thái + số ngày trước
const ROWS = [
  { who: 'Cô Năm - Quận 1', lng: 106.700, lat: 10.776, daysAgo: 1, status: 'delivered' },
  { who: 'Anh Hùng - TP. Thủ Đức', lng: 106.770, lat: 10.851, daysAgo: 2, status: 'delivered' },
  { who: 'Bà Tư - Gò Vấp', lng: 106.665, lat: 10.838, daysAgo: 3, status: 'delivered' },
  { who: 'Chú Ba - Bình Thạnh', lng: 106.712, lat: 10.804, daysAgo: 5, status: 'delivered' },
  { who: 'Em Lan - Quận 7', lng: 106.722, lat: 10.738, daysAgo: 7, status: 'failed', reason: 'Người nhận không có mặt tại điểm giao' },
];

const qr = () => crypto.randomBytes(32).toString('hex');

async function main() {
  const user = await prisma.user.findUnique({ where: { email: SHIPPER_EMAIL } });
  if (!user) throw new Error(`Không tìm thấy user ${SHIPPER_EMAIL}`);
  const vp = await prisma.volunteerProfile.findUnique({ where: { userId: user.id } });
  if (!vp) throw new Error('Shipper chưa có hồ sơ TNV — chạy seed-deliveries.js trước.');

  const have = await prisma.delivery.count({ where: { shipperId: vp.id, status: { in: ['delivered', 'failed'] } } });
  if (have >= DESIRED) {
    console.log(`Đã có ${have} đơn lịch sử — bỏ qua.`);
    return;
  }

  const listings = await prisma.$queryRawUnsafe(
    `SELECT id, title, ST_X(pickup_location::geometry) lng, ST_Y(pickup_location::geometry) lat
     FROM food_listings WHERE status='active' AND deleted_at IS NULL AND pickup_location IS NOT NULL LIMIT 10`,
  );
  if (listings.length === 0) throw new Error('Không có listing active.');
  const receivers = await prisma.receiverProfile.findMany({ where: { isCharityOrg: false }, select: { id: true }, take: 10 });
  if (receivers.length === 0) throw new Error('Không có receiver.');

  let created = 0;
  for (let i = have; i < DESIRED; i++) {
    const row = ROWS[i % ROWS.length];
    const listing = listings[i % listings.length];
    const receiver = receivers[i % receivers.length];
    const distanceKm = Math.round((Math.random() * 50 + 10)) / 10;
    const delivered = row.status === 'delivered';

    await prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw(Prisma.sql`
        INSERT INTO reservations (listing_id, receiver_id, quantity, status, qr_token, qr_expires_at, receiver_notes, created_at, updated_at)
        VALUES (${listing.id}::uuid, ${receiver.id}::uuid, 1,
                ${delivered ? 'completed' : 'confirmed'}::reservation_status, ${qr()},
                NOW() - (${row.daysAgo} || ' days')::interval + INTERVAL '30 min',
                ${'[seed-history] Giao tới ' + row.who},
                NOW() - (${row.daysAgo} || ' days')::interval, NOW())
        RETURNING id`);
      const [d] = await tx.$queryRaw(Prisma.sql`
        INSERT INTO deliveries (reservation_id, shipper_id, status, pickup_location, delivery_location, distance_km,
                                assigned_at, picked_up_at, delivered_at, failed_reason, created_at, updated_at)
        VALUES (${r.id}::uuid, ${vp.id}::uuid, ${row.status}::delivery_status,
                ST_SetSRID(ST_MakePoint(${listing.lng}, ${listing.lat}), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography,
                ${distanceKm},
                NOW() - (${row.daysAgo} || ' days')::interval,
                NOW() - (${row.daysAgo} || ' days')::interval + INTERVAL '20 min',
                ${delivered ? Prisma.sql`NOW() - (${row.daysAgo} || ' days')::interval + INTERVAL '50 min'` : Prisma.sql`NULL`},
                ${row.reason ?? null},
                NOW() - (${row.daysAgo} || ' days')::interval, NOW())
        RETURNING id`);
      // offer đã được nhận (accepted) khớp lịch sử
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO shipper_task_offers (delivery_id, shipper_id, status, expires_at, offered_at, responded_at)
        VALUES (${d.id}::uuid, ${vp.id}::uuid, 'accepted'::offer_status,
                NOW() - (${row.daysAgo} || ' days')::interval + INTERVAL '2 min',
                NOW() - (${row.daysAgo} || ' days')::interval,
                NOW() - (${row.daysAgo} || ' days')::interval + INTERVAL '1 min')`);
    });
    created++;
    console.log(`  · ${delivered ? '✓ đã giao' : '✗ thất bại'}: "${listing.title}" → ${row.who}`);
  }
  console.log(`\nDone. Tạo ${created} đơn lịch sử. Đăng nhập ${SHIPPER_EMAIL} → trang Giao hàng (cuối trang).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
