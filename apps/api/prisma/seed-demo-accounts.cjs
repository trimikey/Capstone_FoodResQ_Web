/**
 * Seed bộ tài khoản DEMO cho buổi bảo vệ — 7 nhóm vai, mỗi nhóm 2 tài khoản.
 * Mật khẩu dùng chung: Password123@
 *
 *   node -r dotenv/config prisma/seed-demo-accounts.cjs
 *
 * Idempotent: chạy lại nhiều lần không tạo trùng (upsert theo email).
 *
 * LƯU Ý về khuôn mặt (eKYC): người nhận cá nhân và tình nguyện viên bị chặn
 * đặt đơn / nhận việc khi `face_descriptor` còn NULL. Script gieo sẵn một
 * vector 128 chiều NGẪU NHIÊN để mở cổng chặn đó. Vector này không phải khuôn
 * mặt của ai cả, nên bước ĐỐI CHIẾU khuôn mặt lúc giao nhận sẽ không khớp —
 * khi demo hãy dùng đường quét QR / ảnh bằng chứng, hoặc để từng người tự
 * đăng ký lại khuôn mặt thật trong app.
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const PASSWORD = 'Password123@';

// Khu vực Thủ Đức, TP.HCM — trùng địa bàn các listing demo.
const BASE = { lng: 106.7717, lat: 10.8494 };
const at = (dLng, dLat) => ({ lng: BASE.lng + dLng, lat: BASE.lat + dLat });

/** Vector 128 chiều ngẫu nhiên: xa mọi khuôn mặt thật (euclidean > 0.6) nên
 *  không đụng cơ chế chống trùng khuôn mặt của người dùng khác. */
function syntheticDescriptor(seed) {
  let x = seed * 9301 + 49297;
  const rnd = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280 - 0.5;
  };
  return Array.from({ length: 128 }, () => Number((rnd() * 0.2).toFixed(6)));
}

const ADMINS = [
  { email: 'quantri1@gmail.com', fullName: 'Nguyễn Quản Trị' },
  { email: 'quantri2@gmail.com', fullName: 'Trần Quản Trị' },
];

const PROVIDERS = [
  {
    email: 'nhacungcap1@gmail.com', fullName: 'Lê Văn Hùng',
    businessName: 'Quán Cơm Tấm Ba Miền', businessType: 'restaurant',
    address: '12 Võ Văn Ngân, P. Linh Chiểu, TP. Thủ Đức, TP.HCM',
    contactPhone: '0901234567', loc: at(0.0010, 0.0008),
  },
  {
    email: 'nhacungcap2@gmail.com', fullName: 'Phạm Thị Lan',
    businessName: 'Tiệm Bánh Mì Hương Việt', businessType: 'bakery',
    address: '48 Đặng Văn Bi, P. Bình Thọ, TP. Thủ Đức, TP.HCM',
    contactPhone: '0901234568', loc: at(-0.0015, 0.0012),
  },
];

const RECEIVERS = [
  {
    email: 'nguoinhan1@gmail.com', fullName: 'Nguyễn Thị Mai',
    address: '25 Hoàng Diệu 2, P. Linh Trung, TP. Thủ Đức, TP.HCM', loc: at(0.0022, -0.0014),
  },
  {
    email: 'nguoinhan2@gmail.com', fullName: 'Trần Văn Bình',
    address: '77 Lê Văn Việt, P. Hiệp Phú, TP. Thủ Đức, TP.HCM', loc: at(-0.0026, -0.0009),
  },
];

const CHARITIES = [
  {
    email: 'tochuctuthien1@gmail.com', fullName: 'Hội Chữ Thập Đỏ Thủ Đức',
    organizationName: 'Bếp Ăn Từ Thiện Thủ Đức',
    address: '110 Kha Vạn Cân, P. Linh Tây, TP. Thủ Đức, TP.HCM', loc: at(0.0008, 0.0026),
  },
  {
    email: 'tochuctuthien2@gmail.com', fullName: 'Nhóm Thiện Nguyện Sẻ Chia',
    organizationName: 'Bếp Yêu Thương Sẻ Chia',
    address: '5 Đường số 6, P. Trường Thọ, TP. Thủ Đức, TP.HCM', loc: at(-0.0019, 0.0021),
  },
];

const VOLUNTEERS = [
  // Tình nguyện viên giao hàng
  { email: 'tnvgh1@gmail.com', fullName: 'Võ Minh Khoa', spec: 'shipper', vehicleType: 'Xe máy', vehiclePlate: '59X1-111.11', loc: at(0.0012, 0.0004) },
  { email: 'tnvgh2@gmail.com', fullName: 'Đặng Quốc Anh', spec: 'shipper', vehicleType: 'Xe máy', vehiclePlate: '59X2-222.22', loc: at(-0.0011, 0.0006) },
  // Tình nguyện viên bếp
  { email: 'tnvbep1@gmail.com', fullName: 'Huỳnh Thị Thu', spec: 'chef', loc: at(0.0009, 0.0024) },
  { email: 'tnvbep2@gmail.com', fullName: 'Bùi Văn Sơn', spec: 'chef', loc: at(-0.0017, 0.0019) },
  // Tình nguyện viên phục vụ
  { email: 'tnvpv1@gmail.com', fullName: 'Ngô Thanh Hà', spec: 'waiter', loc: at(0.0014, 0.0022) },
  { email: 'tnvpv2@gmail.com', fullName: 'Đỗ Gia Bảo', spec: 'waiter', loc: at(-0.0013, 0.0017) },
];

const PERIODS = ['midnight', 'morning', 'afternoon', 'evening'];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const created = [];

  const upsertUser = (email, fullName, role) =>
    prisma.user.upsert({
      where: { email },
      update: { fullName, role, status: 'active', passwordHash, deletedAt: null },
      create: { email, fullName, role, status: 'active', passwordHash },
    });

  // 1. Quản trị viên
  for (const a of ADMINS) {
    await upsertUser(a.email, a.fullName, 'admin');
    created.push(['Quản trị viên', a.email, a.fullName]);
  }

  // 2. Nhà cung cấp
  for (const pv of PROVIDERS) {
    const user = await upsertUser(pv.email, pv.fullName, 'provider');
    const profile = await prisma.providerProfile.upsert({
      where: { userId: user.id },
      update: {
        businessName: pv.businessName, businessType: pv.businessType, address: pv.address,
        contactPhone: pv.contactPhone, isVerified: true, verificationStatus: 'approved', verifiedAt: new Date(),
      },
      create: {
        userId: user.id, businessName: pv.businessName, businessType: pv.businessType,
        address: pv.address, contactPhone: pv.contactPhone, isVerified: true,
        verificationStatus: 'approved', verifiedAt: new Date(),
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_profiles
      SET location = ST_SetSRID(ST_MakePoint(${pv.loc.lng}, ${pv.loc.lat}), 4326)::geography
      WHERE id = ${profile.id}::uuid
    `);
    created.push(['Nhà cung cấp', pv.email, pv.businessName]);
  }

  // 3. Người nhận cá nhân (có khuôn mặt tổng hợp để qua cổng eKYC)
  for (const [i, rc] of RECEIVERS.entries()) {
    const user = await upsertUser(rc.email, rc.fullName, 'receiver');
    const profile = await prisma.receiverProfile.upsert({
      where: { userId: user.id },
      update: {
        isCharityOrg: false, address: rc.address, faceDescriptor: syntheticDescriptor(1001 + i),
        verificationStatus: 'approved', verifiedAt: new Date(),
      },
      create: {
        userId: user.id, isCharityOrg: false, address: rc.address,
        faceDescriptor: syntheticDescriptor(1001 + i),
        verificationStatus: 'approved', verifiedAt: new Date(),
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE receiver_profiles
      SET location = ST_SetSRID(ST_MakePoint(${rc.loc.lng}, ${rc.loc.lat}), 4326)::geography
      WHERE id = ${profile.id}::uuid
    `);
    created.push(['Người nhận cá nhân', rc.email, rc.fullName]);
  }

  // 4. Tổ chức từ thiện (không cần eKYC)
  for (const ch of CHARITIES) {
    const user = await upsertUser(ch.email, ch.fullName, 'receiver');
    const profile = await prisma.receiverProfile.upsert({
      where: { userId: user.id },
      update: {
        isCharityOrg: true, organizationName: ch.organizationName, address: ch.address,
        verificationStatus: 'approved', verifiedAt: new Date(),
      },
      create: {
        userId: user.id, isCharityOrg: true, organizationName: ch.organizationName,
        address: ch.address, verificationStatus: 'approved', verifiedAt: new Date(),
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE receiver_profiles
      SET location = ST_SetSRID(ST_MakePoint(${ch.loc.lng}, ${ch.loc.lat}), 4326)::geography
      WHERE id = ${profile.id}::uuid
    `);
    created.push(['Tổ chức từ thiện', ch.email, ch.organizationName]);
  }

  // 5. Tình nguyện viên: giao hàng / bếp / phục vụ
  const SPEC_VN = { shipper: 'TNV giao hàng', chef: 'TNV bếp', waiter: 'TNV phục vụ' };
  for (const [i, vl] of VOLUNTEERS.entries()) {
    const user = await upsertUser(vl.email, vl.fullName, 'volunteer');
    const profile = await prisma.volunteerProfile.upsert({
      where: { userId: user.id },
      update: {
        faceDescriptor: syntheticDescriptor(2001 + i),
        verificationStatus: 'approved', verifiedAt: new Date(),
        vehicleType: vl.vehicleType ?? null, vehiclePlate: vl.vehiclePlate ?? null,
      },
      create: {
        userId: user.id, faceDescriptor: syntheticDescriptor(2001 + i),
        verificationStatus: 'approved', verifiedAt: new Date(),
        vehicleType: vl.vehicleType ?? null, vehiclePlate: vl.vehiclePlate ?? null,
        isAvailable: false,
      },
    });
    await prisma.volunteerSpecializationEntry.upsert({
      where: { volunteerId_specialization: { volunteerId: profile.id, specialization: vl.spec } },
      update: { isVerified: true, verifiedAt: new Date() },
      create: { volunteerId: profile.id, specialization: vl.spec, isVerified: true, verifiedAt: new Date() },
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE volunteer_profiles
      SET current_location = ST_SetSRID(ST_MakePoint(${vl.loc.lng}, ${vl.loc.lat}), 4326)::geography,
          location_updated_at = NOW()
      WHERE id = ${profile.id}::uuid
    `);

    // Shipper chỉ nhận được đơn nằm trong ca đã đăng ký → đăng ký sẵn cả 4 ca
    // cho hôm nay và 2 ngày tới để tài khoản dùng được ngay.
    if (vl.spec === 'shipper') {
      for (let d = 0; d < 3; d += 1) {
        const day = new Date();
        day.setDate(day.getDate() + d);
        const workDate = day.toISOString().slice(0, 10);
        for (const period of PERIODS) {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO delivery_shift_registrations (volunteer_id, work_date, period, created_at)
            VALUES (${profile.id}::uuid, ${workDate}::date, ${period}::campaign_shift_period, NOW())
            ON CONFLICT DO NOTHING
          `);
        }
      }
    }
    created.push([SPEC_VN[vl.spec], vl.email, vl.fullName]);
  }

  console.log(`\nĐã tạo / cập nhật ${created.length} tài khoản — mật khẩu chung: ${PASSWORD}\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('Vai trò', 22) + pad('Email', 28) + 'Tên hiển thị');
  console.log('-'.repeat(80));
  for (const row of created) console.log(pad(row[0], 22) + pad(row[1], 28) + row[2]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
