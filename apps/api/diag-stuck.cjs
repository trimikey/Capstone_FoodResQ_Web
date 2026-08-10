/* Chẩn đoán read-only: đơn 'confirmed' đã quá hạn QR nhưng cron không dọn. */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const [one] = await p.$queryRawUnsafe(`
    SELECT r.id, r.status, r.created_at, r.qr_expires_at,
           fl.pickup_start_time, fl.pickup_end_time,
           d.id AS delivery_id, d.status AS delivery_status
    FROM reservations r
    JOIN food_listings fl ON fl.id = r.listing_id
    LEFT JOIN deliveries d ON d.reservation_id = r.id
    WHERE r.id = 'a470cff9-80bf-4b71-b81a-0d101216a7b9'
  `);
  console.log('Đơn trong ảnh:', one);
  if (one) {
    console.log('  qr_expires_at đã qua?', new Date(one.qr_expires_at) < new Date());
  }

  // Phân loại MỌI đơn confirmed quá hạn theo trạng thái delivery
  const buckets = await p.$queryRawUnsafe(`
    SELECT COALESCE(d.status::text, '(không có delivery)') AS delivery_status,
           COUNT(*)::int AS so_don,
           MIN(r.qr_expires_at) AS cu_nhat
    FROM reservations r
    LEFT JOIN deliveries d ON d.reservation_id = r.id
    WHERE r.status = 'confirmed' AND r.qr_expires_at < NOW()
    GROUP BY 1 ORDER BY so_don DESC
  `);
  console.log('\n--- Đơn confirmed đã quá hạn QR, nhóm theo trạng thái delivery ---');
  console.log('(cron chỉ dọn được "(không có delivery)" và "pending_assignment")');
  console.table(buckets);

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); process.exit(1); });
