/*
 * Tạo chiến dịch DEMO đang chạy + assign shipper2@gmail.com vào slot shipper.
 * Sau khi chạy xong:
 *   - Shipper đăng nhập → vào /deliveries → thấy job chờ
 *     (campaign transport đã được broadcast, shipper đã accept).
 *   - Tổ chức đăng nhập → vào /campaigns/[id]/manage → thấy shipper đã nhận việc.
 *
 * Luồng test trễ:
 *   - Shipper accept job → BE tạo delivery (status=assigned).
 *   - Shipper gọi updateStatus → heading_to_provider → qc_completed (pickup).
 *   - Nếu pickedUpAt - pickupStartTime >= 60 phút → trừ -10 trust.
 *
 * CHỈ THÊM dữ liệu mới, không sửa/xoá bản ghi nào đang có.
 * Chạy: node seed-shipper-demo.cjs
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const ORG_EMAIL = 'tochuc4@gmail.com';
const SHIPPER_EMAIL = 'shipper2@gmail.com';
const TITLE = 'DEMO luồng giao hàng — shipper2';

// ─── Chi tiết provider request để test pickup time ──────────────────────────
const PICKUP_START = '10:00'; // Giờ bắt đầu lấy hàng (shipper phải đến lúc này)
const PICKUP_END = '10:30';   // Giờ kết thúc

// ─── Ca shipper trong campaign ────────────────────────────────────────────────
const SHIFTS = [
  { label: 'Ca shipper — Lấy hàng từ NCC', role: 'shipper', startTime: PICKUP_START, endTime: PICKUP_END, slotsNeeded: 1 },
];

/** Hôm nay theo giờ VN, ép về mốc DATE để khớp cột @db.Date. */
function todayVN() {
  const nowVN = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()));
}

(async () => {
  // ── 1. Lấy tổ chức ────────────────────────────────────────────────────────
  const org = await prisma.receiverProfile.findFirst({
    where: { isCharityOrg: true, user: { email: ORG_EMAIL } },
    select: { id: true, userId: true, organizationName: true, address: true },
  });
  if (!org) throw new Error(`Không tìm thấy tổ chức ${ORG_EMAIL}`);
  console.log(`Tổ chức: ${org.organizationName} (${org.id})`);

  // ── 2. Lấy shipper ────────────────────────────────────────────────────────
  const shipper = await prisma.volunteerProfile.findFirst({
    where: {
      user: { email: SHIPPER_EMAIL, status: 'active' },
      specializations: { some: { specialization: 'shipper', isVerified: true } },
    },
    select: {
      id: true,
      userId: true,
      user: { select: { fullName: true, email: true } },
    },
  });
  if (!shipper) throw new Error(`Không tìm thấy TNV shipper xác thực: ${SHIPPER_EMAIL}`);
  console.log(`Shipper: ${shipper.user.fullName} (${shipper.id})`);

  // ── 3. Lấy provider xác thực bằng $queryRaw (location là Unsupported type) ──
  const [providerRow] = await prisma.$queryRaw`
    SELECT pp.id, pp.user_id, pp.business_name, pp.address
    FROM provider_profiles pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.is_verified = true
      AND u.status = 'active'
    LIMIT 1
  `;
  if (!providerRow) throw new Error('Không tìm thấy provider xác thực nào');
  const provider = {
    id: providerRow.id,
    userId: providerRow.user_id,
    businessName: providerRow.business_name,
    address: providerRow.address,
  };
  console.log(`Provider: ${provider.businessName} (${provider.id})`);

  const date = todayVN();

  // ── 4. Kiểm tra trùng ────────────────────────────────────────────────────
  const existing = await prisma.kitchenCampaign.findFirst({
    where: { charityReceiverId: org.id, title: TITLE },
    select: { id: true },
  });
  if (existing) {
    console.log(`\n⚠️  Đã tồn tại: ${existing.id}`);
    console.log(`   /campaigns/${existing.id}/manage`);
    console.log('\nXoá chiến dịch cũ trước khi tạo lại:');
    console.log(`   DELETE FROM campaign_transports WHERE provider_request_id IN`);
    console.log(`     (SELECT id FROM campaign_provider_requests WHERE campaign_id = '${existing.id}');`);
    console.log(`   DELETE FROM shipper_task_offers WHERE delivery_id IN`);
    console.log(`     (SELECT id FROM deliveries WHERE provider_request_id IN`);
    console.log(`       (SELECT id FROM campaign_provider_requests WHERE campaign_id = '${existing.id}'));`);
    console.log(`   DELETE FROM deliveries WHERE provider_request_id IN`);
    console.log(`     (SELECT id FROM campaign_provider_requests WHERE campaign_id = '${existing.id}');`);
    console.log(`   DELETE FROM campaign_provider_requests WHERE campaign_id = '${existing.id}';`);
    console.log(`   DELETE FROM campaign_volunteer_assignments WHERE campaign_id = '${existing.id}';`);
    console.log(`   DELETE FROM campaign_shifts WHERE campaign_id = '${existing.id}';`);
    console.log(`   DELETE FROM kitchen_campaigns WHERE id = '${existing.id}';`);
    return;
  }

  // ── 5. Tạo chiến dịch + shifts ───────────────────────────────────────────
  const [campaignRow] = await prisma.$queryRaw`
    INSERT INTO kitchen_campaigns (
      charity_receiver_id, title, description, kitchen_address, kitchen_location,
      scheduled_date, end_date, start_time, end_time,
      chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
      status, expected_servings, image_urls, menu_items, schedule_items, supply_items,
      created_at, updated_at
    ) VALUES (
      ${org.id}::uuid,
      ${TITLE},
      ${'Chiến dịch demo để test luồng giao hàng: shipper nhận việc từ NCC cho chiến dịch bếp ăn.'},
      ${org.address || 'Đường số 8, Linh Chiểu, Thủ Đức, TP.HCM'},
      ST_SetSRID(ST_MakePoint(${106.7699}, ${10.8506}), 4326)::geography,
      ${date}::date, ${date}::date, ${'09:00'}, ${'17:00'},
      ${0}, ${0}, ${1},
      'in_progress'::campaign_status, ${50},
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      NOW(), NOW()
    ) RETURNING id
  `;
  const campaignId = campaignRow.id;
  console.log(`\n✅ Đã tạo chiến dịch: ${campaignId}`);

  // Tạo shift shipper
  const shifts = await prisma.campaignShift.createManyAndReturn({
    data: SHIFTS.map((s) => ({ campaignId, ...s })),
  });
  const shipperShift = shifts.find((s) => s.role === 'shipper');
  if (!shipperShift) throw new Error('Không tạo được shift shipper');

  // ── 6. Assign shipper2 vào shift shipper ─────────────────────────────────
  await prisma.campaignVolunteerAssignment.create({
    data: {
      campaignId,
      volunteerId: shipper.id,
      shiftId: shipperShift.id,
      role: 'shipper',
      status: 'assigned',
    },
  });
  await prisma.kitchenCampaign.update({
    where: { id: campaignId },
    data: { shipperSlotsFilled: 1 },
  });
  await prisma.campaignShift.update({
    where: { id: shipperShift.id },
    data: { slotsFilled: 1 },
  });
  console.log(`✅ Đã assign shipper2 vào ca '${shipperShift.label}'`);

  // ── 7. Tổ chức gửi request đến provider (needsTransport=true) ────────────
  const [requestRow] = await prisma.$queryRaw`
    INSERT INTO campaign_provider_requests (
      campaign_id, receiver_id, provider_id,
      status, needs_transport,
      scheduled_date, pickup_start_time, pickup_end_time,
      message,
      created_at, updated_at
    ) VALUES (
      ${campaignId}::uuid,
      ${org.id}::uuid,
      ${provider.id}::uuid,
      'accepted'::campaign_request_status,
      true,
      ${date}::date,
      ${PICKUP_START},
      ${PICKUP_END},
      ${'Yêu cầu vận chuyển thực phẩm cho chiến dịch. Shipper đến lấy đúng giờ.'},
      NOW(), NOW()
    ) RETURNING id
  `;
  const requestId = requestRow.id;
  console.log(`✅ Đã tạo CampaignProviderRequest (accepted, needsTransport=true): ${requestId}`);

  // ── 8. Tạo CampaignTransport + Delivery ──────────────────────────────────
  const [transportRow] = await prisma.$queryRaw`
    INSERT INTO campaign_transports (
      provider_request_id, status, created_at, updated_at
    ) VALUES (
      ${requestId}::uuid,
      'pending',
      NOW(), NOW()
    ) RETURNING id
  `;
  const transportId = transportRow.id;
  console.log(`✅ Đã tạo CampaignTransport: ${transportId}`);

  // Lấy toạ độ provider từ bảng thực tế
  const providerGeo = await prisma.$queryRaw`
    SELECT
      ST_X(location::geometry) AS lng,
      ST_Y(location::geometry) AS lat
    FROM provider_profiles
    WHERE id = ${provider.id}::uuid
  `;
  const lng = providerGeo?.[0]?.lng ?? 106.6297;
  const lat = providerGeo?.[0]?.lat ?? 10.8231;

  // Lấy toạ độ kitchen campaign
  const kitchenGeo = await prisma.$queryRaw`
    SELECT
      ST_X(kitchen_location::geometry) AS lng,
      ST_Y(kitchen_location::geometry) AS lat
    FROM kitchen_campaigns
    WHERE id = ${campaignId}::uuid
  `;
  const kLng = kitchenGeo?.[0]?.lng ?? 106.7699;
  const kLat = kitchenGeo?.[0]?.lat ?? 10.8506;

  // Tạo delivery
  const [deliveryRow] = await prisma.$queryRaw`
    INSERT INTO deliveries (
      provider_request_id, shipper_id, status,
      pickup_location, delivery_location, distance_km,
      assigned_at,
      created_at, updated_at
    ) VALUES (
      ${requestId}::uuid,
      ${shipper.id}::uuid,
      'assigned'::delivery_status,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${kLng}, ${kLat}), 4326)::geography,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${kLng}, ${kLat}), 4326)::geography
      ) / 1000.0,
      NOW(),
      NOW(), NOW()
    ) RETURNING id
  `;
  const deliveryId = deliveryRow.id;
  console.log(`✅ Đã tạo Delivery (assigned → shipper2): ${deliveryId}`);

  // Cập nhật campaign_transports trỏ đến delivery
  await prisma.$executeRaw`
    UPDATE campaign_transports
    SET delivery_id = ${deliveryId}::uuid,
        assigned_at = NOW(),
        status = 'assigned',
        updated_at = NOW()
    WHERE id = ${transportId}::uuid
  `;

  // ── 9. Tạo shipper_task_offer cho shipper2 (accepted) ─────────────────────
  await prisma.$queryRaw`
    INSERT INTO shipper_task_offers (
      delivery_id, shipper_id, status, offered_at, responded_at, expires_at
    ) VALUES (
      ${deliveryId}::uuid,
      ${shipper.id}::uuid,
      'accepted'::offer_status,
      NOW(),
      NOW(),
      NOW() + INTERVAL '1 hour'
    )
  `;
  console.log(`✅ Đã tạo ShipperTaskOffer (accepted) cho shipper2`);

  // ── 10. Đảm bảo shipper là unavailable (đang có delivery) ─────────────────
  await prisma.volunteerProfile.update({
    where: { id: shipper.id },
    data: { isAvailable: false },
  });

  // ── Kết quả ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('✅ DEMO SHIPPER SẴN SÀNG TEST');
  console.log('═══════════════════════════════════════════════');
  console.log(`Chiến dịch: ${campaignId}`);
  console.log(`Provider Request: ${requestId} (accepted, needsTransport=true)`);
  console.log(`Transport: ${transportId} (assigned)`);
  console.log(`Delivery: ${deliveryId} (assigned → shipper2)`);
  console.log(`\n📋 Thông tin pickup:`);
  console.log(`   Provider: ${provider.businessName}`);
  console.log(`   Địa chỉ lấy hàng: ${provider.address}`);
  console.log(`   Giờ bắt đầu: ${PICKUP_START}`);
  console.log(`   Giờ kết thúc: ${PICKUP_END}`);
  console.log(`   Ngày: ${date.toISOString().slice(0, 10)}`);
  console.log(`\n🔑 Test trễ ≥ 60 phút:`);
  console.log(`   1. Shipper gọi updateStatus → qc_completed`);
  console.log(`   2. BE so sánh pickedUpAt vs pickupStartTime (${PICKUP_START})`);
  console.log(`   3. Nếu muộn ≥ 60 phút → -10 trust score`);
  console.log(`\n🌐 URLs:`);
  console.log(`   Chiến dịch: /campaigns/${campaignId}/manage`);
  console.log(`   Job giao hàng (shipper): /deliveries`);
  console.log(`   Khu vực shipper: /deliveries/history`);
})()
  .catch((e) => {
    console.error('❌ FAILED:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
