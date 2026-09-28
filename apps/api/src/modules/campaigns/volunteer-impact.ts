import type { PrismaService } from '@/prisma/prisma.service';
import { demandUnit } from './rescued-kg';

/** Ca đã thực sự đi làm (đã điểm danh trở đi) — `assigned` mới là đăng ký, chưa tính. */
const WORKED = ['checked_in', 'in_progress', 'completed'] as const;
const PERIOD_ORDER = ['morning', 'afternoon', 'evening', 'midnight'] as const;

export interface VolunteerImpact {
  totals: {
    campaignsJoined: number;
    campaignsCompleted: number;
    shiftsDone: number;
    upcomingShifts: number;
    points: number;
    servingsDistributed: number;
    distributionRounds: number;
    kgPickedUp: number;
    pickups: number;
    dishStepsDone: number;
    /** % ca điểm danh trong ân hạn; null = chưa điểm danh ca nào. */
    onTimeRate: number | null;
  };
  roles: Array<{ role: string; shifts: number }>;
  /** 6 tháng gần nhất (giờ VN), luôn đủ 6 mốc liên tục. */
  monthly: Array<{ ym: string; chef: number; ops: number; campaigns: number }>;
  periods: Array<{ period: string; shifts: number }>;
  punctuality: { onTime: number; late: number; absent: number };
  campaigns: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    roles: string[];
    shifts: number;
    servings: number;
    kg: number;
    steps: number;
    points: number;
  }>;
}

const vnMonth = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Đóng góp CÁ NHÂN của một TNV (đầu bếp / giao hàng / phục vụ) trên mọi chiến dịch —
 * cho trang Tổng quan của TNV. Trước đây trang này hiện số liệu TOÀN HỆ THỐNG
 * ("Tất cả chiến dịch", "Tổng cộng đồng") nên TNV không thấy mình đã làm được gì.
 *
 * Một chiến dịch "đã tham gia" = có ít nhất một ca đã điểm danh; đăng ký rồi vắng
 * không tính (vắng nằm riêng trong `punctuality.absent`).
 */
export async function buildVolunteerImpact(
  prisma: PrismaService,
  volunteerId: string,
  graceMinutes: number,
): Promise<VolunteerImpact> {
  const [assignments, distributions, pickups, steps] = await Promise.all([
    prisma.campaignVolunteerAssignment.findMany({
      where: { volunteerId },
      select: {
        campaignId: true,
        role: true,
        status: true,
        workDate: true,
        checkInLateMinutes: true,
        pointsAwarded: true,
        shift: { select: { period: true } },
        campaign: { select: { title: true, status: true, scheduledDate: true } },
      },
    }),
    // Đợt phát tính cho mọi người được giao đi phát (cả đội cùng làm), không chỉ
    // người bấm chốt — đi phát cùng nhau mà chỉ một người được ghi công là sai.
    prisma.mealDistribution.findMany({
      where: {
        completedAt: { not: null },
        OR: [{ completedByVolunteerId: volunteerId }, { assigneeIds: { array_contains: volunteerId } }],
      },
      select: { campaignId: true, actualServings: true, servingsServed: true },
    }),
    prisma.campaignIngredientPickup.findMany({
      where: { volunteerId },
      select: { campaignId: true, receivedKg: true, providerRequest: { select: { demandDetails: true } } },
    }),
    prisma.campaignDishStep.findMany({
      where: { completedByVolunteerId: volunteerId, status: 'done' },
      select: { campaignId: true },
    }),
  ]);

  const todayKey = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const worked = assignments.filter((a) => (WORKED as readonly string[]).includes(a.status));

  // ── Theo chiến dịch ──
  type Row = VolunteerImpact['campaigns'][number];
  const byCampaign = new Map<string, Row>();
  const rowOf = (a: (typeof assignments)[number]): Row => {
    let row = byCampaign.get(a.campaignId);
    if (!row) {
      row = {
        id: a.campaignId,
        title: a.campaign.title,
        date: a.campaign.scheduledDate.toISOString().slice(0, 10),
        status: a.campaign.status,
        roles: [],
        shifts: 0,
        servings: 0,
        kg: 0,
        steps: 0,
        points: 0,
      };
      byCampaign.set(a.campaignId, row);
    }
    return row;
  };
  for (const a of worked) {
    const row = rowOf(a);
    row.shifts += 1;
    row.points += a.pointsAwarded ?? 0;
    if (!row.roles.includes(a.role)) row.roles.push(a.role);
  }

  let servingsDistributed = 0;
  for (const d of distributions) {
    const s = d.actualServings ?? d.servingsServed;
    servingsDistributed += s;
    const row = byCampaign.get(d.campaignId);
    if (row) row.servings += s;
  }
  let kgPickedUp = 0;
  for (const pk of pickups) {
    if (demandUnit(pk.providerRequest.demandDetails as { quantityUnit?: unknown } | null) !== 'kg') continue;
    const kg = Number(pk.receivedKg);
    kgPickedUp += kg;
    const row = byCampaign.get(pk.campaignId);
    if (row) row.kg += kg;
  }
  for (const st of steps) {
    const row = byCampaign.get(st.campaignId);
    if (row) row.steps += 1;
  }

  // ── Theo vai trò / buổi ──
  const roleCount = new Map<string, number>();
  const periodCount = new Map<string, number>();
  for (const a of worked) {
    roleCount.set(a.role, (roleCount.get(a.role) ?? 0) + 1);
    const period = a.shift?.period ?? 'other';
    periodCount.set(period, (periodCount.get(period) ?? 0) + 1);
  }

  // ── 6 tháng gần nhất ──
  // Mốc cuối = tháng muộn hơn giữa tháng này và ca muộn nhất: tổ chức được bắt đầu
  // sớm nên có ca ngày trực ở tháng sau đã làm xong — cắt ở tháng hiện tại sẽ mất ca đó.
  const anchor = worked.reduce<Date>((max, a) => {
    const d = a.workDate ?? a.campaign.scheduledDate;
    return d > max ? d : max;
  }, new Date(Date.now() + 7 * 3600_000));
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5 + i, 1)).toISOString().slice(0, 7),
  );
  const monthly = months.map((ym) => ({ ym, chef: 0, ops: 0, campaigns: 0 }));
  const campaignsInMonth = new Map<string, Set<string>>();
  for (const a of worked) {
    const ym = vnMonth(a.workDate ?? a.campaign.scheduledDate);
    const m = monthly.find((x) => x.ym === ym);
    if (!m) continue;
    if (a.role === 'chef') m.chef += 1;
    else m.ops += 1;
    const set = campaignsInMonth.get(ym) ?? new Set<string>();
    set.add(a.campaignId);
    campaignsInMonth.set(ym, set);
  }
  for (const m of monthly) m.campaigns = campaignsInMonth.get(m.ym)?.size ?? 0;

  // ── Đúng giờ ──
  const checkedIn = worked.filter((a) => a.checkInLateMinutes != null);
  const onTime = checkedIn.filter((a) => (a.checkInLateMinutes ?? 0) <= graceMinutes).length;
  const absent = assignments.filter((a) => a.status === 'absent').length;

  const upcomingShifts = assignments.filter(
    (a) =>
      a.status === 'assigned' &&
      ['approved', 'in_progress'].includes(a.campaign.status) &&
      (a.workDate ?? a.campaign.scheduledDate).toISOString().slice(0, 10) >= todayKey,
  ).length;

  const campaigns = [...byCampaign.values()]
    .map((r) => ({ ...r, kg: round1(r.kg) }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    totals: {
      campaignsJoined: byCampaign.size,
      campaignsCompleted: campaigns.filter((c) => c.status === 'completed').length,
      shiftsDone: worked.length,
      upcomingShifts,
      points: worked.reduce((s, a) => s + (a.pointsAwarded ?? 0), 0),
      servingsDistributed,
      distributionRounds: distributions.length,
      kgPickedUp: round1(kgPickedUp),
      pickups: pickups.length,
      dishStepsDone: steps.length,
      onTimeRate: checkedIn.length > 0 ? Math.round((onTime / checkedIn.length) * 100) : null,
    },
    roles: ['chef', 'shipper', 'waiter']
      .map((role) => ({ role, shifts: roleCount.get(role) ?? 0 }))
      .filter((r) => r.shifts > 0),
    monthly,
    periods: [...PERIOD_ORDER, 'other']
      .map((period) => ({ period, shifts: periodCount.get(period) ?? 0 }))
      .filter((p) => p.shifts > 0),
    punctuality: { onTime, late: checkedIn.length - onTime, absent },
    campaigns,
  };
}
