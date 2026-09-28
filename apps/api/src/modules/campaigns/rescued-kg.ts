import type { PrismaService } from '@/prisma/prisma.service';
import { parseDonationQuantity } from './supply-progress';

/** Đơn vị số lượng của một đơn nguyên liệu — đơn cũ không ghi đơn vị là kg. */
export function demandUnit(demand: { quantityUnit?: unknown } | null | undefined): string {
  const u = typeof demand?.quantityUnit === 'string' ? demand.quantityUnit.trim() : '';
  return u || 'kg';
}

export type RescuedKgSource = 'kitchen' | 'donation' | 'listing';

export interface RescuedKgEntry {
  source: RescuedKgSource;
  kg: number;
  at: Date;
}

/**
 * Mọi khoản "kg lương thực đã cứu" của toàn hệ thống, mỗi khoản kèm mốc thời gian —
 * NGUỒN DUY NHẤT cho báo cáo minh bạch và dashboard admin, để hai nơi không lệch nhau.
 *
 *  - kitchen:  nguyên liệu TNV đã ký nhận về bếp chiến dịch (chỉ đơn tính theo kg).
 *  - donation: quyên góp chiến dịch đã nhận mà KHÔNG đi qua đơn — khoản đi qua đơn
 *              (`providerRequestId`) đã nằm trong sổ ký nhận, cộng nữa là đếm hai lần.
 *  - listing:  thực phẩm người nhận đã lấy từ tin đăng (chỉ tin khai `weightPerUnitKg`
 *              mới quy ra kg được — phần thiếu khai bị bỏ qua, con số THẬN TRỌNG).
 */
export async function collectRescuedKg(prisma: PrismaService): Promise<RescuedKgEntry[]> {
  const [pickups, donations, reservations] = await Promise.all([
    prisma.campaignIngredientPickup.findMany({
      select: { receivedKg: true, confirmedAt: true, providerRequest: { select: { demandDetails: true } } },
    }),
    prisma.campaignDonation.findMany({
      where: { status: 'received', providerRequestId: null },
      select: { quantity: true, receivedAt: true },
    }),
    prisma.reservation.findMany({
      where: { status: 'completed' },
      select: { quantity: true, updatedAt: true, listing: { select: { weightPerUnitKg: true } } },
    }),
  ]);

  const entries: RescuedKgEntry[] = [];
  const push = (source: RescuedKgSource, kg: number, at: Date | null) => {
    if (!at || !Number.isFinite(kg) || kg <= 0) return;
    entries.push({ source, kg, at });
  };

  for (const pk of pickups) {
    if (demandUnit(pk.providerRequest.demandDetails as { quantityUnit?: unknown } | null) !== 'kg') continue;
    push('kitchen', Number(pk.receivedKg), pk.confirmedAt);
  }
  for (const don of donations) {
    push('donation', parseDonationQuantity(don.quantity, 'kg') ?? 0, don.receivedAt);
  }
  for (const r of reservations) {
    const perUnit = r.listing?.weightPerUnitKg ? Number(r.listing.weightPerUnitKg) : 0;
    push('listing', perUnit * Number(r.quantity), r.updatedAt);
  }
  return entries;
}

/** Khoá tháng theo giờ Việt Nam (UTC+7) — "YYYY-MM". */
export function vnMonthKey(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
}
