/*
 * Tao 2 account demo cho luong mobile chef/waiter.
 *
 * Idempotent: chay lai nhieu lan khong tao trung user/profile/specialization.
 * Neu campaign "DEMO luong bep - TNV nhieu ca" dang co san, script se gan:
 *   - chef.demo@foodresq.vn vao ca bep dau tien o trang thai assigned
 *   - waiter.demo@foodresq.vn vao ca phuc vu dau tien o trang thai assigned
 *
 * Chay tu apps/api:
 *   node seed-chef-waiter-demo-accounts.cjs
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const PASSWORD = 'Provider123';
const CAMPAIGN_TITLE = 'DEMO luồng bếp — TNV nhiều ca';
const CENTER = { lng: 106.7699, lat: 10.8506 };

const ACCOUNTS = [
  {
    email: 'chef.demo@foodresq.vn',
    fullName: 'Demo Đầu Bếp Mobile',
    specialization: 'chef',
    idCardNumber: 'DEMO-CHEF-001',
    dLng: 0.001,
    dLat: 0.001,
  },
  {
    email: 'waiter.demo@foodresq.vn',
    fullName: 'Demo Phục Vụ Mobile',
    specialization: 'waiter',
    idCardNumber: 'DEMO-WAITER-001',
    dLng: -0.001,
    dLat: 0.001,
  },
];

async function upsertVolunteer(account, passwordHash) {
  const user = await prisma.user.upsert({
    where: { email: account.email },
    update: {
      fullName: account.fullName,
      role: 'volunteer',
      status: 'active',
      passwordHash,
      deletedAt: null,
    },
    create: {
      email: account.email,
      passwordHash,
      fullName: account.fullName,
      role: 'volunteer',
      status: 'active',
      phone: null,
    },
  });

  let volunteer = await prisma.volunteerProfile.findUnique({ where: { userId: user.id } });
  if (!volunteer) {
    volunteer = await prisma.volunteerProfile.create({
      data: {
        userId: user.id,
        idCardNumber: account.idCardNumber,
        isAvailable: true,
        verificationStatus: 'approved',
        verifiedAt: new Date(),
      },
    });
  } else {
    volunteer = await prisma.volunteerProfile.update({
      where: { id: volunteer.id },
      data: {
        idCardNumber: account.idCardNumber,
        isAvailable: true,
        verificationStatus: 'approved',
        verifiedAt: volunteer.verifiedAt ?? new Date(),
      },
    });
  }

  await prisma.volunteerSpecializationEntry.upsert({
    where: {
      volunteerId_specialization: {
        volunteerId: volunteer.id,
        specialization: account.specialization,
      },
    },
    update: {
      isVerified: true,
      verifiedAt: new Date(),
    },
    create: {
      volunteerId: volunteer.id,
      specialization: account.specialization,
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  await prisma.$executeRaw(Prisma.sql`
    UPDATE volunteer_profiles
    SET current_location = ST_SetSRID(ST_MakePoint(${CENTER.lng + account.dLng}, ${CENTER.lat + account.dLat}), 4326)::geography,
        location_updated_at = NOW()
    WHERE id = ${volunteer.id}::uuid
  `);

  return { user, volunteer };
}

async function assignToDemoCampaign(volunteersByRole) {
  const campaign = await prisma.kitchenCampaign.findFirst({
    where: { title: CAMPAIGN_TITLE },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!campaign) {
    console.log(`- Chua co campaign "${CAMPAIGN_TITLE}", bo qua buoc gan ca.`);
    return;
  }

  for (const role of ['chef', 'waiter']) {
    const volunteer = volunteersByRole[role];
    const shift = await prisma.campaignShift.findFirst({
      where: { campaignId: campaign.id, role },
      orderBy: { startTime: 'asc' },
    });
    if (!shift) {
      console.log(`- Campaign ${campaign.id} khong co ca ${role}, bo qua.`);
      continue;
    }

    const existed = await prisma.campaignVolunteerAssignment.findFirst({
      where: { campaignId: campaign.id, volunteerId: volunteer.id, shiftId: shift.id },
      select: { id: true, status: true },
    });
    if (existed) {
      console.log(`- Da co assignment ${role}: ${shift.label} (${existed.status})`);
      continue;
    }

    await prisma.campaignVolunteerAssignment.create({
      data: {
        campaignId: campaign.id,
        volunteerId: volunteer.id,
        shiftId: shift.id,
        role,
        status: 'assigned',
      },
    });
    await prisma.campaignShift.update({
      where: { id: shift.id },
      data: { slotsFilled: { increment: 1 } },
    });
    console.log(`- Gan ${role}: ${shift.label} (${campaign.status})`);
  }

  for (const role of ['chef', 'waiter']) {
    const approved = await prisma.campaignVolunteerAssignment.findMany({
      where: {
        campaignId: campaign.id,
        role,
        status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
      },
      select: { volunteerId: true },
    });
    const count = new Set(approved.map((item) => item.volunteerId)).size;
    await prisma.kitchenCampaign.update({
      where: { id: campaign.id },
      data: role === 'chef' ? { chefSlotsFilled: count } : { waiterSlotsFilled: count },
    });
  }

  console.log(`- Campaign demo: ${campaign.title} (${campaign.id})`);
}

(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const volunteersByRole = {};

  for (const account of ACCOUNTS) {
    const { volunteer } = await upsertVolunteer(account, passwordHash);
    volunteersByRole[account.specialization] = volunteer;
    console.log(`✓ ${account.specialization}: ${account.email} / ${PASSWORD}`);
  }

  await assignToDemoCampaign(volunteersByRole);

  console.log('\nDone. Tai khoan demo mobile:');
  for (const account of ACCOUNTS) {
    console.log(`- ${account.fullName}: ${account.email} / ${PASSWORD}`);
  }
})()
  .catch((error) => {
    console.error('FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
