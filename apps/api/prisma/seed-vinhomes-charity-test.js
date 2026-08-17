/* eslint-disable */
// Idempotent test data for charity -> provider campaign contribution flow.
// Run from apps/api: node prisma/seed-vinhomes-charity-test.js
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const CHARITY = {
  email: 'charity.vinhomes@foodresq.vn',
  password: 'Provider123',
  fullName: 'Tổ Chức Thiện Nguyện Vinhomes Grand Park',
  organizationName: 'Tổ Chức Thiện Nguyện Vinhomes Grand Park',
  phone: '0909001122',
  address: 'Vinhomes Grand Park, Phường Long Bình, TP. Thủ Đức, TP.HCM',
  lat: 10.843,
  lng: 106.844,
};

function campaignDate(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const CAMPAIGN = {
  title: 'Test phê duyệt NCC đóng góp - Vinhomes Grand Park',
  description:
    'Chiến dịch test flow tổ chức gửi yêu cầu hợp tác và provider phản hồi đóng góp thực phẩm.',
  address: CHARITY.address,
  date: campaignDate(3),
  startTime: '08:00',
  endTime: '12:00',
  expectedServings: 120,
  chefSlotsNeeded: 2,
  waiterSlotsNeeded: 3,
  shipperSlotsNeeded: 2,
  supplyItems: [
    { name: 'Cơm hộp / suất ăn nóng', quantity: 120, unit: 'suất' },
    { name: 'Rau củ sơ chế', quantity: 25, unit: 'kg' },
  ],
};

async function upsertCharity() {
  const passwordHash = await bcrypt.hash(CHARITY.password, 12);
  const user = await prisma.user.upsert({
    where: { email: CHARITY.email },
    update: {
      fullName: CHARITY.fullName,
      phone: CHARITY.phone,
      role: 'receiver',
      status: 'active',
      deletedAt: null,
    },
    create: {
      email: CHARITY.email,
      passwordHash,
      fullName: CHARITY.fullName,
      phone: CHARITY.phone,
      role: 'receiver',
      status: 'active',
    },
  });

  let receiver = await prisma.receiverProfile.findUnique({ where: { userId: user.id } });
  if (!receiver) {
    receiver = await prisma.receiverProfile.create({
      data: {
        userId: user.id,
        isCharityOrg: true,
        organizationName: CHARITY.organizationName,
        address: CHARITY.address,
        verificationStatus: 'approved',
        verifiedAt: new Date(),
      },
    });
  } else {
    receiver = await prisma.receiverProfile.update({
      where: { id: receiver.id },
      data: {
        isCharityOrg: true,
        organizationName: CHARITY.organizationName,
        address: CHARITY.address,
        verificationStatus: 'approved',
        verifiedAt: receiver.verifiedAt ?? new Date(),
      },
    });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE receiver_profiles
    SET location = ST_SetSRID(ST_MakePoint(${CHARITY.lng}, ${CHARITY.lat}), 4326)::geography,
        updated_at = NOW()
    WHERE id = ${receiver.id}::uuid
  `);

  return { user, receiver };
}

async function upsertCampaign(receiverId) {
  const existing = await prisma.kitchenCampaign.findFirst({
    where: { charityReceiverId: receiverId, title: CAMPAIGN.title },
    select: { id: true },
  });

  if (existing) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE kitchen_campaigns
      SET description = ${CAMPAIGN.description},
          kitchen_address = ${CAMPAIGN.address},
          kitchen_location = ST_SetSRID(ST_MakePoint(${CHARITY.lng}, ${CHARITY.lat}), 4326)::geography,
          scheduled_date = ${CAMPAIGN.date}::date,
          start_time = ${CAMPAIGN.startTime},
          end_time = ${CAMPAIGN.endTime},
          chef_slots_needed = ${CAMPAIGN.chefSlotsNeeded},
          waiter_slots_needed = ${CAMPAIGN.waiterSlotsNeeded},
          shipper_slots_needed = ${CAMPAIGN.shipperSlotsNeeded},
          expected_servings = ${CAMPAIGN.expectedServings},
          supply_items = ${JSON.stringify(CAMPAIGN.supplyItems)}::jsonb,
          status = 'open'::campaign_status,
          updated_at = NOW()
      WHERE id = ${existing.id}::uuid
    `);
    return existing.id;
  }

  const [row] = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO kitchen_campaigns (
      charity_receiver_id, title, description, kitchen_address, kitchen_location,
      scheduled_date, start_time, end_time,
      chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
      expected_servings, supply_items, status, created_at, updated_at
    ) VALUES (
      ${receiverId}::uuid, ${CAMPAIGN.title}, ${CAMPAIGN.description}, ${CAMPAIGN.address},
      ST_SetSRID(ST_MakePoint(${CHARITY.lng}, ${CHARITY.lat}), 4326)::geography,
      ${CAMPAIGN.date}::date, ${CAMPAIGN.startTime}, ${CAMPAIGN.endTime},
      ${CAMPAIGN.chefSlotsNeeded}, ${CAMPAIGN.waiterSlotsNeeded}, ${CAMPAIGN.shipperSlotsNeeded},
      ${CAMPAIGN.expectedServings}, ${JSON.stringify(CAMPAIGN.supplyItems)}::jsonb,
      'open'::campaign_status, NOW(), NOW()
    )
    RETURNING id::text
  `);
  return row.id;
}

async function upsertPendingProviderRequest(campaignId, receiverId) {
  const provider = await prisma.providerProfile.findFirst({
    where: {
      verificationStatus: 'approved',
      user: { status: 'active', deletedAt: null },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, businessName: true, user: { select: { email: true } } },
  });

  if (!provider) return null;

  const demandDetails = {
    foodCategory: 'cooked_meal',
    ingredientName: 'Suất ăn nóng / thực phẩm sẵn dùng',
    quantityKg: 60,
    expectedServings: CAMPAIGN.expectedServings,
    neededFrom: CAMPAIGN.startTime,
    neededTo: CAMPAIGN.endTime,
    requireAtvstpCert: false,
    requireColdChain: false,
    requireQcPhoto: true,
    nonCommercialWaiver: true,
    waiverAcceptedAt: new Date().toISOString(),
  };

  const existing = await prisma.campaignProviderRequest.findFirst({
    where: { campaignId, providerId: provider.id },
    select: { id: true },
  });

  const data = {
    receiverId,
    message:
      'Dữ liệu test: tổ chức cần provider phản hồi đóng góp cho chiến dịch Vinhomes Grand Park.',
    durationMonths: 1,
    status: 'pending',
    demandDetails,
    reviewedAt: null,
    reviewedNote: null,
  };

  const request = existing
    ? await prisma.campaignProviderRequest.update({ where: { id: existing.id }, data })
    : await prisma.campaignProviderRequest.create({
        data: { ...data, campaignId, providerId: provider.id },
      });

  return { requestId: request.id, provider };
}

async function main() {
  const { user, receiver } = await upsertCharity();
  const campaignId = await upsertCampaign(receiver.id);
  const providerRequest = await upsertPendingProviderRequest(campaignId, receiver.id);

  console.log('Seed xong dữ liệu test charity Vinhomes.');
  console.log(`Charity login: ${CHARITY.email} / ${CHARITY.password}`);
  console.log(`Charity userId: ${user.id}`);
  console.log(`Receiver profileId: ${receiver.id}`);
  console.log(`Campaign: ${CAMPAIGN.title}`);
  console.log(`Campaign ID: ${campaignId}`);
  if (providerRequest) {
    console.log(`Provider request ID: ${providerRequest.requestId}`);
    console.log(`Provider nhận request: ${providerRequest.provider.businessName} (${providerRequest.provider.user.email})`);
  } else {
    console.log('Không tìm thấy provider approved để tạo request pending.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
