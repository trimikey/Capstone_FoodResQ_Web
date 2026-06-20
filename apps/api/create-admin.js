const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  // Check if admin already exists
  const existing = await prisma.user.findUnique({
    where: { email: 'admin@foodresq.com' }
  });

  if (existing) {
    console.log('Admin account already exists: admin@foodresq.com / (your previous password)');
    return;
  }

  await prisma.user.create({
    data: {
      email: 'admin@foodresq.com',
      passwordHash: hashedPassword,
      fullName: 'Admin Kho',
      role: 'admin'
    }
  });
  console.log('Admin account created: admin@foodresq.com / admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
