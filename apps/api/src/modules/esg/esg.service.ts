import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

// Hệ số phát thải: ~2.5 kg CO2e được tránh cho mỗi kg thực phẩm được cứu (ước lượng FAO/WRI)
const CO2_PER_KG = 2.5;

@Injectable()
export class EsgService {
  constructor(private prisma: PrismaService) {}

  /** ESG của 1 provider: kg đã cứu, CO2 tránh được, số đơn hoàn tất, listing. */
  async getProviderEsg(userId: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true },
    });
    if (!provider) throw new NotFoundException('Provider profile not found');

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

    const [listingRow] = await this.prisma.$queryRaw<{ total: bigint; active: bigint }[]>(Prisma.sql`
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

  /** Tổng quan ESG toàn nền tảng (công khai cho trang chủ). */
  async getPlatformEsg() {
    const [row] = await this.prisma.$queryRaw<{ kg: number | null; completed: bigint }[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0))
          FILTER (WHERE r.status = 'completed'), 0) AS kg,
        COUNT(*) FILTER (WHERE r.status = 'completed') AS completed
      FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id
    `);
    const [counts] = await this.prisma.$queryRaw<{ providers: bigint; volunteers: bigint }[]>(Prisma.sql`
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
