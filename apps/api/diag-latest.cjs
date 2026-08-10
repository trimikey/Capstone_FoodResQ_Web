/* Chẩn đoán read-only: vì sao đơn mới nhất không bắt được shipper nào. */
require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const [d] = await p.$queryRawUnsafe(`
    SELECT d.id, d.status, d.created_at,
           ST_X(COALESCE(d.pickup_location, fl.pickup_location)::geometry) AS plng,
           ST_Y(COALESCE(d.pickup_location, fl.pickup_location)::geometry) AS plat,
           fl.title
    FROM deliveries d
    LEFT JOIN reservations r ON r.id = d.reservation_id
    LEFT JOIN food_listings fl ON fl.id = r.listing_id
    ORDER BY d.created_at DESC LIMIT 1
  `);
  console.log('Đơn mới nhất:', d);

  const offers = await p.$queryRawUnsafe(`
    SELECT u.email, o.status, o.offered_at, o.expires_at
    FROM shipper_task_offers o
    JOIN volunteer_profiles vp ON vp.id = o.shipper_id
    JOIN users u ON u.id = vp.user_id
    WHERE o.delivery_id = '${d.id}'
    ORDER BY o.offered_at
  `);
  console.log('\n--- Offers của đơn này ---');
  console.table(offers);

  // Phễu lọc: từng điều kiện trong truy vấn match, cho MỌI volunteer
  const funnel = await p.$queryRawUnsafe(`
    SELECT u.email,
           vp.is_available            AS "1_available",
           (vp.verification_status = 'approved') AS "2_approved",
           EXISTS (SELECT 1 FROM volunteer_specializations vs
                   WHERE vs.volunteer_id = vp.id AND vs.specialization = 'shipper'
                     AND vs.is_verified = TRUE)  AS "3_shipper_verified",
           (vp.current_location IS NOT NULL)     AS "4_has_location",
           (u.status = 'active' AND u.deleted_at IS NULL) AS "5_active_user",
           CASE WHEN vp.current_location IS NULL THEN NULL
                ELSE ROUND(ST_Distance(vp.current_location::geography,
                     ST_SetSRID(ST_MakePoint(${d.plng}, ${d.plat}), 4326)::geography)::numeric)
           END AS dist_m,
           CASE WHEN vp.current_location IS NULL THEN NULL
                ELSE ST_DWithin(vp.current_location::geography,
                     ST_SetSRID(ST_MakePoint(${d.plng}, ${d.plat}), 4326)::geography, 5000)
           END AS "6_within_5km"
    FROM volunteer_profiles vp
    JOIN users u ON u.id = vp.user_id
    WHERE u.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM volunteer_specializations vs
                  WHERE vs.volunteer_id = vp.id AND vs.specialization = 'shipper')
    ORDER BY dist_m NULLS LAST
  `);
  console.log('\n--- Phễu lọc shipper (đủ 6 điều kiện mới được mời) ---');
  console.table(funnel);

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await p.$disconnect(); process.exit(1); });
