const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const email = 'provider@foodresq.com';
  const password = 'provider123';
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Check if provider already exists
  const existing = await prisma.user.findUnique({
    where: { email }
  });

  if (existing) {
    console.log('Provider account already exists: ' + email);
    return;
  }

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        fullName: 'Bách Hóa Xanh (Food Provider)',
        role: 'provider',
        status: 'active'
      }
    });

    await tx.providerProfile.create({
      data: {
        userId: createdUser.id,
        businessName: 'Bách Hóa Xanh',
        businessType: 'supermarket',
        address: '123 Nguyễn Thị Minh Khai, Quận 1, TP.HCM',
        isVerified: true,
        verificationStatus: 'approved'
      }
    });
    
    // Khởi tạo toạ độ địa lý dùng query thô
    await tx.$executeRaw`
      UPDATE provider_profiles
      SET location = ST_SetSRID(ST_MakePoint(106.6923, 10.7766), 4326)::geography
      WHERE user_id = ${createdUser.id}::uuid
    `;

    return createdUser;
  });

  console.log(`Provider account created successfully: \nEmail: ${email}\nPassword: ${password}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
