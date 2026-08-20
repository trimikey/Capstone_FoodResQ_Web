/**
 * Seed món ăn quanh Diên Khánh – Nha Trang (Khánh Hoà) để test màn "Tìm thực phẩm"
 * khi dev đứng ở khu vực này — dữ liệu mẫu cũ toàn TP.HCM nên bán kính 50km ra 0 kết quả.
 *
 * Chạy:  node prisma/seed-nhatrang-listings.cjs   (từ thư mục apps/api)
 * Chạy lại an toàn: script xoá các tin cùng tên đã seed trước đó rồi tạo mới,
 * khung giờ luôn lấy NOW → tin luôn đang mở bất kể chạy lúc nào.
 */
require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

const IMG = {
  bread: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917393/foodresq/food_bread.jpg',
  lunchbox: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917394/foodresq/food_lunchbox.jpg',
  salad: 'https://res.cloudinary.com/djestwdwo/image/upload/v1785917395/foodresq/food_salad.jpg',
};

/** Các điểm quanh vị trí GPS của dev (Diên Khánh) và trung tâm Nha Trang. */
const LISTINGS = [
  { title: 'Cơm gà xối mỡ cuối ngày', category: 'cooked_meal', qty: 10, img: IMG.lunchbox,
    address: 'Chợ Diên Khánh, Thị trấn Diên Khánh, Khánh Hoà', lng: 109.091, lat: 12.257 },
  { title: 'Bánh mì thịt nguội còn nóng', category: 'bakery', qty: 15, img: IMG.bread,
    address: 'Thành cổ Diên Khánh, Diên Khánh, Khánh Hoà', lng: 109.0946, lat: 12.2625 },
  { title: 'Nem nướng Ninh Hoà dư tiệc', category: 'cooked_meal', qty: 8, img: IMG.lunchbox,
    address: 'Diên An, Diên Khánh, Khánh Hoà', lng: 109.115, lat: 12.25 },
  { title: 'Bún cá sứa còn 12 tô', category: 'cooked_meal', qty: 12, img: IMG.lunchbox,
    address: 'Tây Nha Trang, Nha Trang, Khánh Hoà', lng: 109.16, lat: 12.255 },
  { title: 'Trái cây tổng hợp cuối chợ', category: 'fresh_fruit', qty: 20, img: IMG.salad,
    address: 'Chợ Đầm, Nha Trang, Khánh Hoà', lng: 109.192, lat: 12.253 },
  { title: 'Suất cơm chay 0 đồng', category: 'cooked_meal', qty: 10, img: IMG.salad,
    address: 'Bắc Nha Trang, Nha Trang, Khánh Hoà', lng: 109.18, lat: 12.28 },
];

async function main() {
  // Gắn vào một NCC đã duyệt bất kỳ — tin có toạ độ riêng nên vị trí NCC không ảnh hưởng tìm kiếm.
  const provider = await prisma.providerProfile.findFirst({
    where: { verificationStatus: 'approved' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, businessName: true },
  });
  if (!provider) throw new Error('Không có NCC nào đã duyệt trong DB để gắn tin.');

  // Re-runnable: dọn các tin cùng tên đã seed lần trước (chỉ tin CHƯA có đơn đặt).
  const titles = LISTINGS.map((l) => l.title);
  const old = await prisma.foodListing.findMany({
    where: { title: { in: titles }, reservations: { none: {} } },
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.foodListing.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    console.log(`Đã xoá ${old.length} tin seed cũ.`);
  }

  const now = Date.now();
  const start = new Date(now - 3600_000);        // mở nhận từ 1 giờ trước
  const end = new Date(now + 48 * 3600_000);     // kéo dài 2 ngày
  for (const l of LISTINGS) {
    const row = await prisma.foodListing.create({
      data: {
        providerId: provider.id,
        title: l.title,
        description: `Thực phẩm cứu trợ khu vực Khánh Hoà — ${l.address}.`,
        category: l.category,
        quantityTotal: l.qty,
        quantityRemaining: l.qty,
        quantityUnit: 'portion',
        pickupStartTime: start,
        pickupEndTime: end,
        dailyStartMinute: 360,   // mở cửa 06:00
        dailyEndMinute: 1320,    // đóng cửa 22:00
        expiryTime: end,
        pickupAddress: l.address,
        maxPerReservation: 3,
        imageUrls: [l.img],
        status: 'active',
      },
      select: { id: true, title: true },
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE food_listings
      SET pickup_location = ST_SetSRID(ST_MakePoint(${l.lng}, ${l.lat}), 4326)::geography
      WHERE id = ${row.id}::uuid
    `);
    console.log(`+ ${row.title} @ ${l.lat},${l.lng}`);
  }
  console.log(`Xong: ${LISTINGS.length} tin gắn NCC "${provider.businessName}".`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
