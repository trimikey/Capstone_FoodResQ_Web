/**
 * Seed ~25 listing mẫu cho provider đầu tiên trong DB (hoặc 1 provider mới nếu DB trống).
 * Trải rộng TP.HCM (Quận 1, 3, 7, Bình Thạnh, Thủ Đức, Gò Vấp, Tân Bình, Phú Nhuận, Bình Tân, Tân Phú).
 * Pickup window: hôm nay (từ 11:00 → 22:00), expiry = pickupEnd +6h.
 *
 * Chạy:  npx ts-node -r tsconfig-paths/register prisma/seed-listings.ts
 * Hoặc:  node --import tsx prisma/seed-listings.ts   (đã cài tsx)
 */

import { PrismaClient, FoodCategory, QuantityUnit, ListingStatus, UserRole, VerificationStatus, BusinessType } from '@prisma/client';
import { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Toạ độ trung tâm các quận tại TP.HCM
const DISTRICTS = [
  { name: 'Quận 1',        lat: 10.776, lng: 106.701 },
  { name: 'Quận 3',        lat: 10.784, lng: 106.685 },
  { name: 'Quận 4',        lat: 10.760, lng: 106.715 },
  { name: 'Quận 5',        lat: 10.755, lng: 106.668 },
  { name: 'Quận 6',        lat: 10.748, lng: 106.635 },
  { name: 'Quận 7',        lat: 10.741, lng: 106.728 },
  { name: 'Quận 8',        lat: 10.724, lng: 106.628 },
  { name: 'Quận 10',       lat: 10.772, lng: 106.667 },
  { name: 'Quận 11',       lat: 10.762, lng: 106.651 },
  { name: 'Quận 12',       lat: 10.863, lng: 106.654 },
  { name: 'Quận Bình Thạnh', lat: 10.812, lng: 106.710 },
  { name: 'Quận Gò Vấp',    lat: 10.838, lng: 106.665 },
  { name: 'Quận Tân Bình',  lat: 10.801, lng: 106.652 },
  { name: 'Quận Phú Nhuận', lat: 10.794, lng: 106.681 },
  { name: 'Quận Tân Phú',   lat: 10.793, lng: 106.633 },
  { name: 'Quận Bình Tân',  lat: 10.764, lng: 106.605 },
  { name: 'TP Thủ Đức',     lat: 10.849, lng: 106.772 },
] as const;

interface Spec {
  title: string;
  category: FoodCategory;
  qty: number;
  unit: QuantityUnit;
  weightKg?: number;
  desc: string;
  image: string;
  isSurpriseBag?: boolean;
}

const MENU: Spec[] = [
  { title: 'Cơm gà xối mỡ',  category: 'cooked_meal', qty: 30, unit: 'portion', weightKg: 0.4, desc: 'Cơm gà nóng, giao trong ngày.', image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600' },
  { title: 'Bánh mì heo quay', category: 'bakery',      qty: 50, unit: 'item',    weightKg: 0.2, desc: 'Bánh mì vỏ giòn, nhân heo quay.', image: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=600' },
  { title: 'Salad rau trộn',  category: 'vegetables',   qty: 15, unit: 'box',     weightKg: 0.3, desc: 'Salad rau xanh tươi, sốt dầu giấm.', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600' },
  { title: 'Trái cây tổng hợp', category: 'fresh_fruit', qty: 20, unit: 'kg',      weightKg: 1,   desc: 'Táo, cam, chuối, xoài chín vừa.', image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=600' },
  { title: 'Nước ép cam tươi', category: 'beverage',   qty: 40, unit: 'liter',   weightKg: 1,   desc: 'Nước ép cam nguyên chất 100%.', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600' },
  { title: 'Bún bò Huế', category: 'cooked_meal', qty: 25, unit: 'portion', weightKg: 0.5, desc: 'Bún bò Huế cay nồng đậm đà.', image: 'https://images.unsplash.com/photo-1576577445504-6af96477fb52?w=600' },
  { title: 'Phở bò tái', category: 'cooked_meal', qty: 35, unit: 'portion', weightKg: 0.45, desc: 'Phở bò nước dùng trong, thịt tái mềm.', image: 'https://images.unsplash.com/photo-1582870514977-9e0608e35d4e?w=600' },
  { title: 'Bánh bao nhân thịt', category: 'bakery', qty: 60, unit: 'item', weightKg: 0.15, desc: 'Bánh bao hấp nóng, nhân thịt heo.', image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600' },
  { title: 'Cháo gà', category: 'cooked_meal', qty: 20, unit: 'portion', weightKg: 0.4, desc: 'Cháo gà nấu nhừ, bổ dưỡng.', image: 'https://images.unsplash.com/photo-1547308283-0e3251ed9fde?w=600' },
  { title: 'Cơm tấm sườn bì', category: 'cooked_meal', qty: 22, unit: 'portion', weightKg: 0.5, desc: 'Cơm tấm sườn nướng, bì, chả.', image: 'https://images.unsplash.com/photo-1626777552726-4b6c54a86f46?w=600' },
  { title: 'Xôi đậu xanh', category: 'cooked_meal', qty: 18, unit: 'portion', weightKg: 0.25, desc: 'Xôi đậu xanh dẻo thơm, ăn kèm ruốc.', image: 'https://images.unsplash.com/photo-1604908554007-9b1dd0aa0b6e?w=600' },
  { title: 'Bánh cuốn nóng', category: 'cooked_meal', qty: 25, unit: 'portion', weightKg: 0.3, desc: 'Bánh cuốn chả lụa, hành phi.', image: 'https://images.unsplash.com/photo-1626808642875-0aa545482dfb?w=600' },
  { title: 'Bánh xèo miền Tây', category: 'cooked_meal', qty: 15, unit: 'portion', weightKg: 0.35, desc: 'Bánh xèo giòn rụm, rau sống.', image: 'https://images.unsplash.com/photo-1564671166547-3ea5d8b5b1e8?w=600' },
  { title: 'Hủ tiếu Nam Vang', category: 'cooked_meal', qty: 28, unit: 'portion', weightKg: 0.45, desc: 'Hủ tiếu nước dùng trong, tôm thịt.', image: 'https://images.unsplash.com/photo-1582870514977-9e0608e35d4e?w=600' },
  { title: 'Gỏi cuốn tôm thịt', category: 'cooked_meal', qty: 30, unit: 'item', weightKg: 0.15, desc: 'Gỏi cuốn tươi, chấm tương đậu phộng.', image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600' },
  { title: 'Rau muống xào tỏi', category: 'vegetables', qty: 12, unit: 'kg', weightKg: 1, desc: 'Rau muống tươi xào tỏi thơm.', image: 'https://images.unsplash.com/photo-1592417817098-8dd3d13789b6?w=600' },
  { title: 'Cà rốt baby Đà Lạt', category: 'vegetables', qty: 15, unit: 'kg', weightKg: 1, desc: 'Cà rốt baby tươi, giòn ngọt.', image: 'https://images.unsplash.com/photo-1582515073490-399d8049c55e?w=600' },
  { title: 'Bắp cải tím hữu cơ', category: 'vegetables', qty: 18, unit: 'kg', weightKg: 1, desc: 'Bắp cải tím organic, không thuốc trừ sâu.', image: 'https://images.unsplash.com/photo-1594282486557-95ec2681d022?w=600' },
  { title: 'Thanh long ruột đỏ', category: 'fresh_fruit', qty: 25, unit: 'kg', weightKg: 1, desc: 'Thanh long Bình Thuận, ruột đỏ đậm.', image: 'https://images.unsplash.com/photo-1527325678289-6cc4f5d22f9c?w=600' },
  { title: 'Xoài cát Hòa Lộc', category: 'fresh_fruit', qty: 10, unit: 'kg', weightKg: 1, desc: 'Xoài cát Hòa Lộc chín vàng, thơm ngọt.', image: 'https://images.unsplash.com/photo-1591073113125-e46713c830ed?w=600' },
  { title: 'Trứng gà ta', category: 'raw_protein', qty: 100, unit: 'item', weightKg: 0.06, desc: 'Trứng gà ta thả vườn, giàu dinh dưỡng.', image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600' },
  { title: 'Ức gà phi lê', category: 'raw_protein', qty: 8, unit: 'kg', weightKg: 1, desc: 'Ức gà phi lê đông lạnh, sạch.', image: 'https://images.unsplash.com/photo-1626089676561-6b0f03fa1f5c?w=600' },
  { title: 'Cá hồi fillet', category: 'raw_protein', qty: 6, unit: 'kg', weightKg: 1, desc: 'Cá hồi phi lê tươi, giàu Omega-3.', image: 'https://images.unsplash.com/photo-1574781330855-d0db8cc6a79c?w=600' },
  { title: 'Gạo ST25', category: 'dry_goods', qty: 50, unit: 'kg', weightKg: 1, desc: 'Gạo ST25 thơm dẻo, đóng gói 5kg.', image: 'https://images.unsplash.com/photo-1568347877321-f8935c71629f?w=600' },
  { title: 'Sữa tươi TH true MILK', category: 'beverage', qty: 80, unit: 'liter', weightKg: 1, desc: 'Sữa tươi tiệt trùng, hộp 1L.', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600' },
  { title: 'Mì gói Omachi', category: 'canned_packaged', qty: 200, unit: 'item', weightKg: 0.08, desc: 'Mì gói Omachi vị tôm chua cay.', image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600' },
  { title: 'Túi bất ngờ 5 phần cơm', category: 'cooked_meal', qty: 10, unit: 'portion', weightKg: 0.4, desc: 'Surprise bag 5 phần cơm trưa — bí mật!', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600', isSurpriseBag: true },
];

async function ensureProvider(): Promise<string> {
  // Lấy provider đầu tiên đã verified
  const existing = await prisma.providerProfile.findFirst({
    where: { verificationStatus: 'approved' },
    include: { user: true },
  });
  if (existing) {
    console.log(`✔ Dùng provider có sẵn: ${existing.businessName} (${existing.user.email})`);
    return existing.id;
  }

  console.log('ℹ Chưa có provider nào → tạo provider mẫu.');
  const user = await prisma.user.create({
    data: {
      email: 'green.kitchen@foodresq.demo',
      passwordHash: '$2b$12$DXyfzVHe6wWXwH7eOYz5Iu7p/X9K3WqfmLpJ1HrLp9nEXuVQz5iq.', // bcrypt 12 rounds placeholder
      fullName: 'Bếp Xanh FoodResq',
      phone: '0901234567',
      role: UserRole.PROVIDER,
      status: 'active',
      emailVerifiedAt: new Date(),
      providerProfile: {
        create: {
          businessName: 'Bếp Xanh FoodResq',
          businessType: BusinessType.RESTAURANT,
          address: 'Quận 1, TP.HCM',
          description: 'Nhà hàng chay & salad — đối tác FoodResq.',
          contactPhone: '0901234567',
          isVerified: true,
          verificationStatus: VerificationStatus.APPROVED,
          verifiedAt: new Date(),
        },
      },
    },
    include: { providerProfile: true },
  });

  console.log(`✔ Provider mới: ${user.providerProfile!.businessName}`);
  return user.providerProfile!.id;
}

function timeToday(hourStart: number, hourEnd: number, expiryAddHours = 6): { pickupStartTime: Date; pickupEndTime: Date; expiryTime: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(hourStart, 0, 0, 0);
  // pickup window kéo dài 1 tháng: start = hôm nay, end = hôm nay + 1 tháng
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  end.setHours(hourEnd, 0, 0, 0);
  const exp = new Date(end.getTime() + expiryAddHours * 60 * 60 * 1000);
  return { pickupStartTime: start, pickupEndTime: end, expiryTime: exp };
}

function randomAddress(districtName: string): string {
  const streets = ['Nguyễn Huệ', 'Trần Hưng Đạo', 'Lê Lợi', 'Hai Bà Trưng', 'Lý Tự Trọng', 'Pasteur', 'Điện Biên Phủ', 'Cách Mạng Tháng 8', 'Nguyễn Trãi', 'Quang Trung'];
  const street = streets[Math.floor(Math.random() * streets.length)];
  const num = Math.floor(Math.random() * 200) + 1;
  return `${num} ${street}, ${districtName}, TP.HCM`;
}

function jitter(coord: number, amount = 0.012): number {
  // ~1.3km offset để listing đổi tụ trong quận
  return coord + (Math.random() - 0.5) * amount * 2;
}

async function main() {
  const providerId = await ensureProvider();

  // Xoá các listing cũ đã seed trước đó để idempotent
  const deleted = await prisma.foodListing.deleteMany({
    where: { providerId, title: { in: MENU.map((m) => m.title) } },
  });
  if (deleted.count > 0) console.log(`↺ Đã xoá ${deleted.count} listing seed trùng tên trước đó.`);

  const now = Date.now();
  let created = 0;

  for (let i = 0; i < MENU.length; i++) {
    const m = MENU[i];
    const district = DISTRICTS[i % DISTRICTS.length];
    const lat = jitter(district.lat);
    const lng = jitter(district.lng);

    // Đa dạng pickup window: 11-14, 14-18, 17-21
    const windows: Array<[number, number]> = [
      [10, 14], [11, 15], [13, 17], [15, 19], [17, 21], [9, 13], [16, 20],
    ];
    const [h1, h2] = windows[i % windows.length];
    const t = timeToday(h1, h2);

    const imgUrl = `[${JSON.stringify(m.image)}]`;

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO food_listings (
          id, provider_id, title, description, category,
          quantity_total, quantity_remaining, quantity_unit, weight_per_unit_kg,
          pickup_start_time, pickup_end_time, expiry_time,
          pickup_address,
          pickup_location,
          storage_conditions, allergen_notes, max_per_reservation,
          image_urls, is_surprise_bag, status,
          created_at, updated_at, deleted_at
        )
        VALUES (
          uuid_generate_v4(), ${providerId}::uuid, ${m.title}, ${m.desc},
          ${m.category}::food_category,
          ${m.qty}::numeric, ${m.qty}::numeric, ${m.unit}::quantity_unit,
          ${m.weightKg ?? null}::numeric,
          ${t.pickupStartTime.toISOString()}::timestamptz,
          ${t.pickupEndTime.toISOString()}::timestamptz,
          ${t.expiryTime.toISOString()}::timestamptz,
          ${randomAddress(district.name)},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${'Bảo quản nơi khô ráo, thoáng mát'}, ${null}, ${m.isSurpriseBag ? 1 : 5},
          ${imgUrl}::jsonb, ${m.isSurpriseBag ?? false}, ${'active'}::listing_status,
          NOW(), NOW(), NULL
        )
      `,
    );
    created++;
  }

  console.log(`\n✅ Đã tạo ${created} listing mẫu (active) trải rộng ${DISTRICTS.length} quận/huyện TP.HCM.`);
  console.log(`🕐 Thời gian chạy: ${new Date(now).toLocaleString('vi-VN')}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed lỗi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
