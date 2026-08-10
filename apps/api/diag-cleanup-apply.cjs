/*
 * Tắt is_available cho các tài khoản shipper "online giả": đang bật sẵn sàng
 * nhưng vị trí không cập nhật trong 24h qua → không ai thực sự online, chỉ
 * chiếm chỗ trong hàng đợi mời (gần nhất trước, mỗi lượt 2 phút).
 *
 * Chỉ nhắm volunteer có chuyên môn 'shipper' đã xác minh — không đụng tài khoản bếp.
 * Đảo ngược dễ: shipper chỉ cần bật lại "Đang sẵn sàng" trong app (thao tác đó
 * đồng thời làm mới GPS, nên họ được xếp hạng đúng vị trí thật).
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const affected = await p.$executeRawUnsafe(`
    UPDATE volunteer_profiles vp
    SET is_available = FALSE, updated_at = NOW()
    WHERE vp.is_available = TRUE
      AND (vp.location_updated_at IS NULL OR vp.location_updated_at < NOW() - INTERVAL '24 hours')
      AND EXISTS (
        SELECT 1 FROM volunteer_specializations vs
        WHERE vs.volunteer_id = vp.id AND vs.specialization = 'shipper' AND vs.is_verified = TRUE
      )
  `);
  console.log('Đã tắt sẵn sàng cho', affected, 'tài khoản.');

  const remaining = await p.$queryRawUnsafe(`
    SELECT u.email, vp.location_updated_at
    FROM volunteer_profiles vp
    JOIN users u ON u.id = vp.user_id
    JOIN volunteer_specializations vs ON vs.volunteer_id = vp.id
      AND vs.specialization = 'shipper' AND vs.is_verified = TRUE
    WHERE vp.is_available = TRUE AND vp.verification_status = 'approved'
      AND vp.current_location IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL
    ORDER BY vp.location_updated_at DESC
  `);
  console.log('\n--- Shipper còn sẵn sàng nhận đơn ---');
  console.table(remaining);

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); process.exit(1); });
