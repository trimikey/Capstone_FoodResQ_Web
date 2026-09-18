import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

// Hệ số phát thải: ~2.5 kg CO2e được tránh cho mỗi kg thực phẩm được cứu (ước lượng FAO/WRI)
const CO2_PER_KG = 2.5;

/** Số tháng tối đa cho báo cáo CSR — chặn client xin chuỗi thời gian vô hạn. */
const MAX_REPORT_MONTHS = 24;
const DEFAULT_REPORT_MONTHS = 6;

/** Một mốc tháng trong chuỗi thời gian báo cáo CSR. */
export interface EsgMonthlyPoint {
  /** Khoá sắp xếp dạng `YYYY-MM` (giờ VN). */
  month: string;
  kg: number;
  co2: number;
  meals: number;
  people: number;
}

@Injectable()
export class EsgService {
  constructor(private prisma: PrismaService) {}

  /** ESG của 1 provider: kg đã cứu, CO2 tránh được, số đơn hoàn tất, listing. */
  async getProviderEsg(userId: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true },
    });
    if (!provider)
      throw new NotFoundException('Không tìm thấy hồ sơ cửa hàng.');

    const [row] = await this.prisma.$queryRaw<
      { kg: number | null; completed: bigint; receivers: bigint }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0))
          FILTER (WHERE r.status = 'completed'), 0) AS kg,
        COUNT(*) FILTER (WHERE r.status = 'completed') AS completed,
        COUNT(DISTINCT r.receiver_id) FILTER (WHERE r.status = 'completed') AS receivers
      FROM food_listings fl
      LEFT JOIN reservations r ON r.listing_id = fl.id
      WHERE fl.provider_id = ${provider.id}::uuid
    `);

    const [listingRow] = await this.prisma.$queryRaw<
      { total: bigint; active: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'active') AS active
      FROM food_listings WHERE provider_id = ${provider.id}::uuid AND deleted_at IS NULL
    `);

    const kg = Math.round(Number(row?.kg ?? 0) * 10) / 10;
    return {
      businessName: provider.businessName,
      kgRescued: kg,
      co2SavedKg: Math.round(kg * CO2_PER_KG * 10) / 10,
      mealsServed: Number(row?.completed ?? 0),
      peopleHelped: Number(row?.receivers ?? 0),
      totalListings: Number(listingRow?.total ?? 0),
      activeListings: Number(listingRow?.active ?? 0),
    };
  }

  /**
   * Báo cáo CSR đầy đủ của 1 provider: tổng quan + chuỗi thời gian theo tháng
   * + phân bổ theo nhóm thực phẩm + tỷ lệ hoàn tất đơn.
   *
   * Mốc thời gian quy tác động về LÚC GIAO XONG (quét QR / ảnh minh chứng), không phải
   * lúc đặt — nếu quy về lúc đặt thì đơn đặt cuối tháng nhận đầu tháng sau sẽ bị tính sai kỳ.
   */
  async getProviderReport(userId: string, monthsInput?: number) {
    const months = Math.min(
      Math.max(Math.trunc(Number(monthsInput) || DEFAULT_REPORT_MONTHS), 1),
      MAX_REPORT_MONTHS,
    );

    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true },
    });
    if (!provider)
      throw new NotFoundException('Không tìm thấy hồ sơ cửa hàng.');

    const providerId = provider.id;

    // LEFT JOIN từ generate_series để tháng không có đơn vẫn là điểm 0 trên biểu đồ,
    // thay vì bị khuyết làm đường xu hướng nhảy cóc.
    const monthlyRows = await this.prisma.$queryRaw<
      { month: string; kg: number; meals: bigint; people: bigint }[]
    >(Prisma.sql`
      WITH months AS (
        SELECT to_char(m, 'YYYY-MM') AS month
        FROM generate_series(
          date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))
            - make_interval(months => ${months - 1}::int),
          date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')),
          interval '1 month'
        ) AS m
      ),
      done AS (
        SELECT
          to_char(
            date_trunc(
              'month',
              COALESCE(r.scanned_at, r.pickup_proof_at, r.updated_at) AT TIME ZONE 'Asia/Ho_Chi_Minh'
            ),
            'YYYY-MM'
          ) AS month,
          SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0)) AS kg,
          COUNT(*) AS meals,
          COUNT(DISTINCT r.receiver_id) AS people
        FROM reservations r
        JOIN food_listings fl ON fl.id = r.listing_id
        WHERE fl.provider_id = ${providerId}::uuid AND r.status = 'completed'
        GROUP BY 1
      )
      SELECT months.month,
             COALESCE(done.kg, 0)::float8 AS kg,
             COALESCE(done.meals, 0) AS meals,
             COALESCE(done.people, 0) AS people
      FROM months LEFT JOIN done ON done.month = months.month
      ORDER BY months.month
    `);

    const categoryRows = await this.prisma.$queryRaw<
      { category: string; kg: number; meals: bigint }[]
    >(Prisma.sql`
      SELECT fl.category::text AS category,
             COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0)), 0)::float8 AS kg,
             COUNT(*) AS meals
      FROM reservations r
      JOIN food_listings fl ON fl.id = r.listing_id
      WHERE fl.provider_id = ${providerId}::uuid AND r.status = 'completed'
      GROUP BY 1
      ORDER BY meals DESC
    `);

    // Mọi trạng thái, kể cả huỷ/no-show — đây chính là phần "chất lượng vận hành" của báo cáo.
    const fulfillmentRows = await this.prisma.$queryRaw<
      { status: string; count: bigint }[]
    >(
      Prisma.sql`
        SELECT r.status::text AS status, COUNT(*) AS count
        FROM reservations r
        JOIN food_listings fl ON fl.id = r.listing_id
        WHERE fl.provider_id = ${providerId}::uuid
        GROUP BY 1
      `,
    );

    const topListingRows = await this.prisma.$queryRaw<
      { title: string; kg: number; meals: bigint }[]
    >(Prisma.sql`
      SELECT fl.title,
             COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0)), 0)::float8 AS kg,
             COUNT(*) AS meals
      FROM reservations r
      JOIN food_listings fl ON fl.id = r.listing_id
      WHERE fl.provider_id = ${providerId}::uuid AND r.status = 'completed'
      GROUP BY fl.id, fl.title
      ORDER BY meals DESC, kg DESC
      LIMIT 5
    `);

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const monthly: EsgMonthlyPoint[] = monthlyRows.map((r) => {
      const kg = round1(Number(r.kg ?? 0));
      return {
        month: r.month,
        kg,
        co2: round1(kg * CO2_PER_KG),
        meals: Number(r.meals ?? 0),
        people: Number(r.people ?? 0),
      };
    });

    return {
      ...(await this.getProviderEsg(userId)),
      rangeMonths: months,
      co2PerKg: CO2_PER_KG,
      monthly,
      byCategory: categoryRows.map((r) => ({
        category: r.category,
        kg: round1(Number(r.kg ?? 0)),
        meals: Number(r.meals ?? 0),
      })),
      fulfillment: fulfillmentRows.map((r) => ({
        status: r.status,
        count: Number(r.count ?? 0),
      })),
      topListings: topListingRows.map((r) => ({
        title: r.title,
        kg: round1(Number(r.kg ?? 0)),
        meals: Number(r.meals ?? 0),
      })),
    };
  }

  /** Tổng quan ESG toàn nền tảng (công khai cho trang chủ). */
  async getPlatformEsg() {
    const [row] = await this.prisma.$queryRaw<
      { kg: number | null; completed: bigint }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0))
          FILTER (WHERE r.status = 'completed'), 0) AS kg,
        COUNT(*) FILTER (WHERE r.status = 'completed') AS completed
      FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id
    `);
    const [counts] = await this.prisma.$queryRaw<
      { providers: bigint; volunteers: bigint }[]
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM provider_profiles) AS providers,
        (SELECT COUNT(*) FROM volunteer_profiles) AS volunteers
    `);

    const kg = Math.round(Number(row?.kg ?? 0) * 10) / 10;
    return {
      kgRescued: kg,
      co2SavedKg: Math.round(kg * CO2_PER_KG * 10) / 10,
      mealsServed: Number(row?.completed ?? 0),
      providers: Number(counts?.providers ?? 0),
      volunteers: Number(counts?.volunteers ?? 0),
    };
  }
}
