const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.PROVIDER_EMAIL || 'provider@foodresq.com';
  const password = process.env.PROVIDER_PASSWORD || 'provider123';

  const hashedPassword = await bcrypt.hash(password, 12); // CLAUDE.md §6: rounds ≥ 12

  await prisma.$transaction(async (tx) => {
    // Upsert user — chạy lại an toàn, reset mật khẩu + đảm bảo role/status
    const user = await tx.user.upsert({
      where: { email },
      update: { passwordHash: hashedPassword, role: 'provider', status: 'active', deletedAt: null },
      create: {
        email,
        passwordHash: hashedPassword,
        fullName: 'Bách Hóa Xanh (Food Provider)',
        role: 'provider',
        status: 'active',
      },
    });

    await tx.providerProfile.upsert({
      where: { userId: user.id },
      update: { isVerified: true, verificationStatus: 'approved' },
      create: {
        userId: user.id,
        businessName: 'Bách Hóa Xanh',
        businessType: 'supermarket',
        address: '123 Nguyễn Thị Minh Khai, Quận 1, TP.HCM',
        isVerified: true,
        verificationStatus: 'approved',
      },
    });

    // Toạ độ địa lý (GEOGRAPHY) — ghi qua query thô
    await tx.$executeRaw`
      UPDATE provider_profiles
      SET location = ST_SetSRID(ST_MakePoint(106.6923, 10.7766), 4326)::geography
      WHERE user_id = ${user.id}::uuid
    `;
  });

  console.log(`✓ Provider sẵn sàng:\n  Email:    ${email}\n  Password: ${password}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
