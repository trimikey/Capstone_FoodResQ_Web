/* eslint-disable */
// Refresh thời gian các tin đang active để chúng không bị filter "pickup_end_time > NOW()" loại bỏ.
// Re-anchor mỗi tin về hiện tại, GIỮ NGUYÊN độ dài cửa sổ nhận hàng & khoảng cách tới hạn dùng của từng tin.
// Không xoá/tạo mới, giữ nguyên cả tin đã gắn reservation.
// Chạy: node prisma/refresh-listings.js   (hoặc: pnpm db:refresh)
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const affected = await prisma.$executeRaw(Prisma.sql`
    UPDATE food_listings
    SET pickup_end_time   = NOW() + (pickup_end_time - pickup_start_time),
        expiry_time       = NOW() + (expiry_time - pickup_start_time),
        pickup_start_time = NOW(),
        updated_at        = NOW()
    WHERE status = 'active'::listing_status
      AND deleted_at IS NULL
  `);
  console.log(`✓ Đã refresh ${affected} tin active. Danh sách thực phẩm sẽ hiển thị lại.`);
}

main()
  .catch((e) => {
    console.error('✗ Refresh thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
