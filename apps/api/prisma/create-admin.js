// Tạo (hoặc cập nhật) 1 tài khoản admin. Chạy: node prisma/create-admin.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const EMAIL = process.env.ADMIN_EMAIL || 'admin@foodresq.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const FULL_NAME = process.env.ADMIN_NAME || 'Quản trị viên';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, role: 'admin', status: 'active', deletedAt: null },
    create: {
      email: EMAIL,
      passwordHash,
      fullName: FULL_NAME,
      role: 'admin',
      status: 'active',
    },
    select: { id: true, email: true, role: true, status: true },
  });
  console.log('✓ Admin sẵn sàng:', user);
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('✗ Lỗi:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
