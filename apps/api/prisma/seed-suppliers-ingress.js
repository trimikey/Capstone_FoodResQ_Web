/* eslint-disable */
// Seed 3 NHÀ CUNG CẤP nguyên liệu thô (rau / thịt / cá / trứng) để test luồng
// "Yêu cầu cung cấp thực phẩm đầu vào" (IngressRequestPanel) của bếp ăn cộng đồng.
//
// Điều kiện để 1 NCC hiện trong danh sách gợi ý (xem CampaignsService.suggestSuppliersForCampaign):
//   - provider_profiles.verification_status = 'approved' + users.status = 'active'
//   - provider_profiles.location IS NOT NULL và nằm trong bán kính bếp chọn
//   - có >= 1 food_listings status='active', pickup_end_time > NOW(), quantity_remaining > 0
//   - nếu bếp lọc theo loại thực phẩm thì phải có tin đúng loại đó
//
// Vì 3 chiến dịch đang mở của tochuc4 nằm ở 3 khu khác nhau (Tân Sơn / Thủ Đức /
// Long Bình) và bán kính mặc định chỉ 5 km, mỗi NCC được đặt cạnh một khu — chọn
// chiến dịch nào cũng có NCC gần để test.
//
// Chạy: node prisma/seed-suppliers-ingress.js
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const PASSWORD = 'Provider123';

/** Danh mục món theo từng NCC — category phải khớp enum food_category trong DB. */
const SUPPLIERS = [
  {
    email: 'ncc.rau@foodresq.vn',
    fullName: 'Vựa Rau Củ Quả Tân Sơn',
    phone: '0901000801',
    businessName: 'Vựa Rau Củ Quả Tân Sơn',
    businessType: 'other',
    address: '145 Phan Huy Ích, Phường 15, Tân Sơn, TP.HCM',
    description: 'Vựa sỉ rau củ quả, giao nguyên liệu cho bếp ăn từ thiện. Có giấy ATVSTP.',
    // Cách bếp "Phan Huy Ích, P15" (106.63016, 10.82386) ~0.6 km
    lng: 106.6350,
    lat: 10.8268,
    listings: [
      { title: 'Rau cải ngọt tươi', category: 'vegetables', unit: 'kg', qty: 60, weight: 1, desc: 'Rau cải ngọt thu hoạch trong ngày, đã sơ chế bỏ lá hư.' },
      { title: 'Bí xanh - bầu - mướp', category: 'vegetables', unit: 'kg', qty: 80, weight: 1, desc: 'Rau quả nấu canh, hàng loại 1 tồn cuối phiên chợ.' },
      { title: 'Cà rốt - khoai tây - hành tây', category: 'vegetables', unit: 'kg', qty: 100, weight: 1, desc: 'Củ quả để lâu, phù hợp nấu số lượng lớn.' },
      { title: 'Trứng gà công nghiệp', category: 'raw_protein', unit: 'kg', qty: 30, weight: 1, desc: 'Trứng gà tươi, đóng khay 30 quả (~1.8 kg/khay).' },
      { title: 'Gạo tẻ 5% tấm', category: 'dry_goods', unit: 'kg', qty: 50, weight: 1, desc: 'Gạo tồn kho còn hạn dài, đóng bao 10 kg.' },
    ],
  },
  {
    email: 'ncc.thitca@foodresq.vn',
    fullName: 'Chợ Đầu Mối Thịt Cá Thủ Đức',
    phone: '0901000802',
    businessName: 'Chợ Đầu Mối Thịt Cá Thủ Đức',
    businessType: 'supermarket',
    address: '99 Đường số 8, Linh Chiểu, Thủ Đức, TP.HCM',
    description: 'Sạp sỉ thịt heo, thịt gà, cá tươi — có kho lạnh và thùng giữ nhiệt < 5°C.',
    // Cách bếp "Đường số 8, Linh Chiểu" (106.76568, 10.85378) ~0.6 km
    lng: 106.7700,
    lat: 10.8565,
    listings: [
      { title: 'Thịt heo xay - nạc dăm', category: 'raw_protein', unit: 'kg', qty: 40, weight: 1, desc: 'Thịt heo pha lóc trong ngày, bảo quản lạnh 0–4°C.' },
      { title: 'Cá basa phi lê', category: 'raw_protein', unit: 'kg', qty: 35, weight: 1, desc: 'Cá basa phi lê cấp đông, đóng túi 2 kg.' },
      { title: 'Đùi gà góc tư', category: 'raw_protein', unit: 'kg', qty: 45, weight: 1, desc: 'Gà công nghiệp làm sẵn, giao kèm thùng đá.' },
      { title: 'Trứng vịt tươi', category: 'raw_protein', unit: 'kg', qty: 25, weight: 1, desc: 'Trứng vịt loại 1, đóng khay 30 quả.' },
      { title: 'Rau muống - rau thơm', category: 'vegetables', unit: 'kg', qty: 40, weight: 1, desc: 'Rau ăn kèm, nhập buổi sáng cùng ngày.' },
    ],
  },
  {
    email: 'ncc.trung@foodresq.vn',
    fullName: 'Trang Trại Trứng & Rau Sạch Long Bình',
    phone: '0901000803',
    businessName: 'Trang Trại Trứng & Rau Sạch Long Bình',
    businessType: 'other',
    address: '12 Đường Vành Đai 3, Long Thạnh Mỹ, Long Bình, TP.HCM',
    description: 'Trang trại trứng gà ta và rau sạch VietGAP, hỗ trợ nguyên liệu cho bếp cộng đồng.',
    // Cách bếp "Vành đai 3, Long Thạnh Mỹ" (106.83639, 10.83388) ~0.5 km
    lng: 106.8395,
    lat: 10.8365,
    listings: [
      { title: 'Trứng gà ta', category: 'raw_protein', unit: 'kg', qty: 35, weight: 1, desc: 'Trứng gà ta nuôi thả vườn, thu mỗi sáng.' },
      { title: 'Thịt gà ta làm sẵn', category: 'raw_protein', unit: 'kg', qty: 30, weight: 1, desc: 'Gà ta mổ sẵn, cấp đông ngay sau khi giết mổ.' },
      { title: 'Cá điêu hồng tươi', category: 'raw_protein', unit: 'kg', qty: 20, weight: 1, desc: 'Cá nuôi ao, giao sống hoặc làm sạch theo yêu cầu bếp.' },
      { title: 'Rau xanh VietGAP các loại', category: 'vegetables', unit: 'kg', qty: 70, weight: 1, desc: 'Cải xanh, mồng tơi, rau dền — cắt theo đơn của bếp.' },
      { title: 'Củ quả nấu canh (bí, cà chua)', category: 'vegetables', unit: 'kg', qty: 55, weight: 1, desc: 'Bí đỏ, cà chua, su su cho bếp nấu số lượng lớn.' },
    ],
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  // Cửa nhận hàng: từ bây giờ đến 7 ngày sau (pickup_end_time phải > NOW()).
  const pickupStart = iso(-60 * 60 * 1000);
  const pickupEnd = iso(7 * 86_400_000);
  const expiry = iso(8 * 86_400_000);

  for (const s of SUPPLIERS) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { fullName: s.fullName, status: 'active', role: 'provider', passwordHash, deletedAt: null },
      create: {
        email: s.email,
        phone: s.phone,
        passwordHash,
        fullName: s.fullName,
        role: 'provider',
        status: 'active',
      },
    });

    const profile = await prisma.providerProfile.upsert({
      where: { userId: user.id },
      update: {
        businessName: s.businessName,
        businessType: s.businessType,
        address: s.address,
        description: s.description,
        contactPhone: s.phone,
        isVerified: true,
        verificationStatus: 'approved',
        verifiedAt: new Date(),
      },
      create: {
        userId: user.id,
        businessName: s.businessName,
        businessType: s.businessType,
        address: s.address,
        description: s.description,
        contactPhone: s.phone,
        isVerified: true,
        verificationStatus: 'approved',
        verifiedAt: new Date(),
      },
    });

    // Toạ độ NCC — cột geography phải ghi qua raw SQL (Prisma khai Unsupported).
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_profiles
      SET location = ST_SetSRID(ST_MakePoint(${s.lng}, ${s.lat}), 4326)::geography
      WHERE id = ${profile.id}::uuid`);

    // Chạy lại script cho sạch: xoá tin cũ CHƯA có đơn giữ chỗ nào.
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM food_listings fl
      WHERE fl.provider_id = ${profile.id}::uuid
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.listing_id = fl.id)`);

    for (const f of s.listings) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO food_listings (
          provider_id, title, description, category, quantity_total, quantity_remaining,
          quantity_unit, weight_per_unit_kg, pickup_start_time, pickup_end_time, expiry_time,
          pickup_address, pickup_location, storage_conditions, max_per_reservation,
          image_urls, status, created_at, updated_at
        ) VALUES (
          ${profile.id}::uuid, ${f.title}, ${f.desc}, ${f.category}::food_category,
          ${f.qty}, ${f.qty}, ${f.unit}::quantity_unit, ${f.weight},
          ${pickupStart}::timestamptz, ${pickupEnd}::timestamptz, ${expiry}::timestamptz,
          ${s.address}, ST_SetSRID(ST_MakePoint(${s.lng}, ${s.lat}), 4326)::geography,
          ${f.category === 'raw_protein' ? 'Bảo quản lạnh 0–4°C, giao bằng thùng giữ nhiệt' : 'Nơi khô ráo, thoáng mát'},
          10, '[]'::jsonb, 'active'::listing_status, NOW(), NOW())`);
    }

    console.log(`✓ ${s.businessName} — ${s.email} / ${PASSWORD} — ${s.listings.length} tin đăng`);
  }

  console.log(`\nDone. ${SUPPLIERS.length} NCC nguyên liệu (rau / thịt / cá / trứng) đã sẵn sàng.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
