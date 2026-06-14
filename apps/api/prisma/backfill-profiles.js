/* eslint-disable */
// Backfill profile cho user cũ (tạo trước khi register tự tạo profile).
// Tạo receiver/volunteer/provider_profile còn thiếu theo role. Idempotent.
// Chạy: node prisma/backfill-profiles.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      receiverProfile: { select: { id: true } },
      providerProfile: { select: { id: true } },
      volunteerProfile: { select: { id: true } },
    },
  });

  let created = 0;
  for (const u of users) {
    const hasProfile = u.receiverProfile || u.providerProfile || u.volunteerProfile;
    if (hasProfile) continue;

    if (u.role === 'receiver') {
      await prisma.receiverProfile.create({ data: { userId: u.id } });
    } else if (u.role === 'volunteer') {
      await prisma.volunteerProfile.create({ data: { userId: u.id } });
    } else if (u.role === 'provider') {
      await prisma.providerProfile.create({
        data: {
          userId: u.id,
          businessName: u.fullName,
          businessType: 'other',
          address: '',
        },
      });
    } else {
      continue; // admin: không cần profile
    }
    created++;
    console.log(`✓ created ${u.role} profile for ${u.email}`);
  }

  console.log(`\nDone. ${created} profile(s) created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
