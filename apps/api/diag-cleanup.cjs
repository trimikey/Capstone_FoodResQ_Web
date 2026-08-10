/*
 * 1) Xác minh migration campaign_transports đã áp dụng.
 * 2) XEM TRƯỚC (chưa ghi) các tài khoản shipper "online giả": đang is_available
 *    nhưng vị trí không được cập nhật trong 24h qua.
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const cols = await p.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'campaign_transports' ORDER BY column_name
  `);
  const have = new Set(cols.map((c) => c.column_name));
  const need = ['assigned_at', 'picked_up_at', 'delivered_at', 'received_at', 'failed_at',
    'failure_reason', 'received_by_user_id', 'receipt_note', 'receipt_photo_url',
    'last_broadcast_at', 'updated_at'];
  const missing = need.filter((n) => !have.has(n));
  console.log('campaign_transports:', cols.length, 'cột');
  console.log(missing.length ? 'VẪN THIẾU: ' + missing.join(', ') : 'MIGRATION OK — đủ cột lifecycle');

  const stale = await p.$queryRawUnsafe(`
    SELECT u.email, vp.location_updated_at,
           ROUND(EXTRACT(EPOCH FROM (NOW() - vp.location_updated_at)) / 86400)::int AS ngay_cu
    FROM volunteer_profiles vp
    JOIN users u ON u.id = vp.user_id
    WHERE vp.is_available = TRUE
      AND (vp.location_updated_at IS NULL OR vp.location_updated_at < NOW() - INTERVAL '24 hours')
    ORDER BY vp.location_updated_at NULLS FIRST
  `);
  console.log('\n--- SẼ TẮT (vị trí cũ hơn 24h) ---');
  console.table(stale);

  const keep = await p.$queryRawUnsafe(`
    SELECT u.email, vp.location_updated_at
    FROM volunteer_profiles vp
    JOIN users u ON u.id = vp.user_id
    WHERE vp.is_available = TRUE AND vp.location_updated_at >= NOW() - INTERVAL '24 hours'
    ORDER BY vp.location_updated_at DESC
  `);
  console.log('\n--- GIỮ NGUYÊN (vị trí mới trong 24h) ---');
  console.table(keep);

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); process.exit(1); });
