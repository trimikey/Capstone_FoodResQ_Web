/* Chẩn đoán read-only: vì sao shipper không nhận được lời mời giao hàng. */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const cols = await p.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'campaign_transports' ORDER BY column_name
  `);
  console.log('campaign_transports columns:', cols.map((c) => c.column_name).join(', '));

  const need = ['last_broadcast_at', 'updated_at', 'assigned_at'];
  const have = new Set(cols.map((c) => c.column_name));
  console.log('MISSING:', need.filter((n) => !have.has(n)).join(', ') || '(none)');

  const shippers = await p.$queryRawUnsafe(`
    SELECT u.email,
           vp.is_available, vp.verification_status,
           (vp.current_location IS NOT NULL) AS has_loc,
           vp.location_updated_at,
           u.status AS user_status,
           EXISTS (SELECT 1 FROM volunteer_specializations vs
                   WHERE vs.volunteer_id = vp.id AND vs.specialization = 'shipper'
                     AND vs.is_verified = TRUE) AS shipper_verified
    FROM volunteer_profiles vp JOIN users u ON u.id = vp.user_id
    WHERE u.deleted_at IS NULL
    ORDER BY vp.is_available DESC NULLS LAST LIMIT 15
  `);
  console.log('\n--- volunteers ---');
  console.table(shippers);

  const recent = await p.$queryRawUnsafe(`
    SELECT d.id, d.status, d.created_at,
           (SELECT COUNT(*) FROM shipper_task_offers o WHERE o.delivery_id = d.id) AS offers
    FROM deliveries d ORDER BY d.created_at DESC LIMIT 8
  `);
  console.log('\n--- recent deliveries ---');
  console.table(recent);

  await p.$disconnect();
})().catch(async (e) => {
  console.error('ERR:', e.message);
  await p.$disconnect();
  process.exit(1);
});
