import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { claimDeadline } from '@/modules/deliveries/deliveries.service';
import { INCIDENT_REASONS } from '@/modules/campaigns/campaign-incidents.service';

/** Đơn đang giao mà quá bấy nhiêu phút không đổi trạng thái thì coi là "treo". */
const STALLED_AFTER_MINUTES = 60;
/** Cửa sổ nhìn lại cho đơn hết hạn không ai nhận. */
const UNCLAIMED_LOOKBACK_DAYS = 7;
const ACTIVE_DELIVERY_STATUSES = ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] as const;
const LIST_LIMIT = 200;

/**
 * Các trang GIÁM SÁT của admin (chỉ đọc): nhà cung cấp, tình nguyện viên, giao hàng,
 * sự cố chiến dịch. Tách khỏi AdminService vì đó toàn là truy vấn tổng hợp — thao tác
 * duyệt / khoá vẫn đi qua các endpoint sẵn có (verifications, users/:id/status).
 */
@Injectable()
export class AdminOperationsService {
  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
  ) {}

  /** Nhà cung cấp kèm số liệu hoạt động: tin đăng, suất đã cho, khiếu nại, đơn nguyên liệu. */
  async listProviders(q?: string) {
    const term = q?.trim();
    const providers = await this.prisma.providerProfile.findMany({
      where: {
        user: { deletedAt: null },
        ...(term
          ? {
              OR: [
                { businessName: { contains: term, mode: 'insensitive' } },
                { address: { contains: term, mode: 'insensitive' } },
                { user: { email: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        businessName: true,
        businessType: true,
        taxCode: true,
        address: true,
        contactPhone: true,
        verificationStatus: true,
        isVerified: true,
        avgRating: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
      },
    });
    if (providers.length === 0) return [];
    const ids = providers.map((p) => p.id);
    const userIds = providers.map((p) => p.user.id);

    const [listingRows, reservationRows, listingReportRows, userReportRows, requestRows, docs] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; active: number; total: number }[]>(Prisma.sql`
        SELECT provider_id::text AS id,
               COUNT(*) FILTER (WHERE status = 'active')::int AS active,
               COUNT(*)::int AS total
        FROM food_listings
        WHERE deleted_at IS NULL AND provider_id = ANY(${ids}::uuid[])
        GROUP BY provider_id
      `),
      this.prisma.$queryRaw<{ id: string; completed: number; finished: number; servings: number }[]>(Prisma.sql`
        SELECT fl.provider_id::text AS id,
               COUNT(*) FILTER (WHERE r.status = 'completed')::int AS completed,
               COUNT(*) FILTER (WHERE r.status IN ('completed', 'cancelled', 'expired', 'no_show'))::int AS finished,
               COALESCE(SUM(r.quantity) FILTER (WHERE r.status = 'completed'), 0)::float8 AS servings
        FROM reservations r
        JOIN food_listings fl ON fl.id = r.listing_id
        WHERE fl.provider_id = ANY(${ids}::uuid[])
        GROUP BY fl.provider_id
      `),
      this.prisma.$queryRaw<{ id: string; total: number; pending: number }[]>(Prisma.sql`
        SELECT fl.provider_id::text AS id,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE rp.status = 'pending')::int AS pending
        FROM reports rp
        JOIN food_listings fl ON fl.id = rp.target_id
        WHERE rp.target_type = 'listing' AND fl.provider_id = ANY(${ids}::uuid[])
        GROUP BY fl.provider_id
      `),
      this.prisma.$queryRaw<{ id: string; total: number; pending: number }[]>(Prisma.sql`
        SELECT rp.target_id::text AS id,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE rp.status = 'pending')::int AS pending
        FROM reports rp
        WHERE rp.target_type = 'user' AND rp.target_id = ANY(${userIds}::uuid[])
        GROUP BY rp.target_id
      `),
      this.prisma.campaignProviderRequest.groupBy({
        by: ['providerId', 'status'],
        where: { providerId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.verificationRequest.findMany({
        where: { userId: { in: userIds }, requestType: 'provider_registration' },
        orderBy: { submittedAt: 'desc' },
        distinct: ['userId'],
        select: { userId: true, documents: true },
      }),
    ]);

    const listingBy = new Map(listingRows.map((r) => [r.id, r]));
    const reservationBy = new Map(reservationRows.map((r) => [r.id, r]));
    const listingReportBy = new Map(listingReportRows.map((r) => [r.id, r]));
    const userReportBy = new Map(userReportRows.map((r) => [r.id, r]));
    const docsBy = new Map(docs.map((d) => [d.userId, d.documents]));
    const requestBy = new Map<string, Record<string, number>>();
    for (const row of requestRows) {
      const bucket = requestBy.get(row.providerId) ?? {};
      bucket[row.status] = row._count._all;
      requestBy.set(row.providerId, bucket);
    }

    return providers.map((p) => {
      const res = reservationBy.get(p.id);
      const lr = listingReportBy.get(p.id);
      const ur = userReportBy.get(p.user.id);
      const req = requestBy.get(p.id) ?? {};
      const documents = docsBy.get(p.user.id) as { evidenceUrls?: unknown } | undefined;
      const evidenceUrls = Array.isArray(documents?.evidenceUrls)
        ? documents.evidenceUrls.filter((u): u is string => typeof u === 'string')
        : [];
      return {
        providerId: p.id,
        userId: p.user.id,
        businessName: p.businessName,
        businessType: p.businessType,
        taxCode: p.taxCode,
        address: p.address,
        contactPhone: p.contactPhone ?? p.user.phone,
        ownerName: p.user.fullName,
        email: p.user.email,
        accountStatus: p.user.status,
        verificationStatus: p.verificationStatus,
        isVerified: p.isVerified,
        avgRating: p.avgRating != null ? Number(p.avgRating) : null,
        evidenceUrls,
        createdAt: p.createdAt,
        listingsActive: listingBy.get(p.id)?.active ?? 0,
        listingsTotal: listingBy.get(p.id)?.total ?? 0,
        servingsGiven: res?.servings ?? 0,
        ordersCompleted: res?.completed ?? 0,
        ordersFinished: res?.finished ?? 0,
        // null khi chưa có đơn nào kết thúc — không hiện "0%" cho cửa hàng mới.
        completionRate: res && res.finished > 0 ? Math.round((res.completed / res.finished) * 100) : null,
        reportsTotal: (lr?.total ?? 0) + (ur?.total ?? 0),
        reportsPending: (lr?.pending ?? 0) + (ur?.pending ?? 0),
        campaignRequests: {
          accepted: req.accepted ?? 0,
          rejected: req.rejected ?? 0,
          pending: req.pending ?? 0,
          expired: req.expired ?? 0,
        },
      };
    });
  }

  /** Tình nguyện viên / shipper kèm chuyên môn, điểm, ca giao hàng và lịch sử làm việc. */
  async listVolunteers(q?: string) {
    const term = q?.trim();
    const volunteers = await this.prisma.volunteerProfile.findMany({
      where: {
        user: {
          deletedAt: null,
          ...(term
            ? {
                OR: [
                  { fullName: { contains: term, mode: 'insensitive' } },
                  { email: { contains: term, mode: 'insensitive' } },
                  { phone: { contains: term } },
                ],
              }
            : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        dedicationPoints: true,
        rank: true,
        vehicleType: true,
        vehiclePlate: true,
        avgRating: true,
        verificationStatus: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true, trustScore: true, avatarUrl: true } },
        specializations: { select: { specialization: true, isVerified: true } },
      },
    });
    if (volunteers.length === 0) return [];
    const ids = volunteers.map((v) => v.id);

    const [deliveryRows, shiftRows, assignmentRows, bulkRows] = await Promise.all([
      this.prisma.delivery.groupBy({
        by: ['shipperId', 'status'],
        where: { shipperId: { in: ids } },
        _count: { _all: true },
      }),
      // "Sắp tới" tính theo ngày Việt Nam — work_date là cột DATE không có múi giờ.
      this.prisma.$queryRaw<{ id: string; total: number; upcoming: number }[]>(Prisma.sql`
        SELECT volunteer_id::text AS id,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int AS upcoming
        FROM delivery_shift_registrations
        WHERE volunteer_id = ANY(${ids}::uuid[])
        GROUP BY volunteer_id
      `),
      this.prisma.campaignVolunteerAssignment.groupBy({
        by: ['volunteerId', 'status'],
        where: { volunteerId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.bulkRun.groupBy({
        by: ['shipperId', 'status'],
        where: { shipperId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    const tally = <T extends { status: string; _count: { _all: number } }>(rows: T[], key: (r: T) => string | null) => {
      const map = new Map<string, Record<string, number>>();
      for (const row of rows) {
        const id = key(row);
        if (!id) continue;
        const bucket = map.get(id) ?? {};
        bucket[row.status] = row._count._all;
        map.set(id, bucket);
      }
      return map;
    };
    const deliveryBy = tally(deliveryRows, (r) => r.shipperId);
    const assignmentBy = tally(assignmentRows, (r) => r.volunteerId);
    const bulkBy = tally(bulkRows, (r) => r.shipperId);
    const shiftBy = new Map(shiftRows.map((r) => [r.id, r]));

    return volunteers.map((v) => {
      const d = deliveryBy.get(v.id) ?? {};
      const a = assignmentBy.get(v.id) ?? {};
      const b = bulkBy.get(v.id) ?? {};
      return {
        volunteerId: v.id,
        userId: v.user.id,
        fullName: v.user.fullName,
        email: v.user.email,
        phone: v.user.phone,
        avatarUrl: v.user.avatarUrl,
        accountStatus: v.user.status,
        trustScore: v.user.trustScore,
        dedicationPoints: v.dedicationPoints,
        rank: v.rank,
        avgRating: v.avgRating != null ? Number(v.avgRating) : null,
        verificationStatus: v.verificationStatus,
        vehicleType: v.vehicleType,
        vehiclePlate: v.vehiclePlate,
        specializations: v.specializations,
        createdAt: v.createdAt,
        shiftsUpcoming: shiftBy.get(v.id)?.upcoming ?? 0,
        shiftsTotal: shiftBy.get(v.id)?.total ?? 0,
        deliveriesDelivered: d.delivered ?? 0,
        deliveriesActive: ACTIVE_DELIVERY_STATUSES.reduce((sum, s) => sum + (d[s] ?? 0), 0),
        // Đơn đã nhận rồi thất bại (bỏ dở / quá hạn) — đơn hết hạn không ai nhận không có shipper nên không tính vào đây.
        deliveriesFailed: d.failed ?? 0,
        campaignShiftsDone: a.completed ?? 0,
        campaignAbsences: a.absent ?? 0,
        bulkRunsCompleted: b.completed ?? 0,
        bulkRunsCancelled: b.cancelled ?? 0,
      };
    });
  }

  /** Toàn cảnh giao hàng: chờ nhận, đang giao, bị treo, hết hạn không ai nhận, và giao sỉ đang chạy. */
  async deliveryMonitor() {
    const [claimWindowMinutes, scheduledCutoffMinutes] = await Promise.all([
      this.systemConfig.getNumber('DELIVERY_CLAIM_WINDOW_MINUTES'),
      this.systemConfig.getNumber('DELIVERY_SCHEDULED_CUTOFF_MINUTES'),
    ]);
    const now = Date.now();
    const select = {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      assignedAt: true,
      failedReason: true,
      distanceKm: true,
      shipper: { select: { user: { select: { fullName: true, phone: true } } } },
      reservation: {
        select: {
          id: true,
          quantity: true,
          deliveryAddress: true,
          deliveryScheduledAt: true,
          receiver: { select: { address: true, user: { select: { fullName: true, phone: true } } } },
          listing: { select: { title: true, pickupAddress: true, provider: { select: { businessName: true } } } },
        },
      },
    } satisfies Prisma.DeliverySelect;

    const [open, unclaimed, bulkRuns] = await Promise.all([
      this.prisma.delivery.findMany({
        where: {
          reservationId: { not: null },
          status: { in: ['pending_assignment', ...ACTIVE_DELIVERY_STATUSES] },
        },
        orderBy: { createdAt: 'asc' },
        take: LIST_LIMIT,
        select,
      }),
      this.prisma.delivery.findMany({
        where: {
          reservationId: { not: null },
          status: 'failed',
          shipperId: null,
          updatedAt: { gte: new Date(now - UNCLAIMED_LOOKBACK_DAYS * 86_400_000) },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select,
      }),
      this.prisma.bulkRun.findMany({
        where: { status: { in: ['requested', 'approved', 'picked_up'] } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: {
          id: true,
          status: true,
          quantity: true,
          quantityDistributed: true,
          createdAt: true,
          approvedAt: true,
          pickedUpAt: true,
          listing: { select: { title: true } },
          provider: { select: { businessName: true } },
          shipper: { select: { user: { select: { fullName: true, phone: true } } } },
          _count: { select: { stops: true } },
        },
      }),
    ]);

    const rows = [...open, ...unclaimed].map((d) => {
      const r = d.reservation;
      const stalledMinutes = Math.floor((now - d.updatedAt.getTime()) / 60_000);
      const isActive = (ACTIVE_DELIVERY_STATUSES as readonly string[]).includes(d.status);
      const group =
        d.status === 'pending_assignment'
          ? 'waiting'
          : d.status === 'failed'
            ? 'unclaimed'
            : isActive && stalledMinutes >= STALLED_AFTER_MINUTES
              ? 'stalled'
              : 'active';
      return {
        deliveryId: d.id,
        reservationId: r?.id ?? null,
        group,
        status: d.status,
        listingTitle: r?.listing.title ?? '—',
        providerName: r?.listing.provider.businessName ?? '—',
        pickupAddress: r?.listing.pickupAddress ?? null,
        receiverName: r?.receiver.user.fullName ?? '—',
        receiverPhone: r?.receiver.user.phone ?? null,
        deliveryAddress: r?.deliveryAddress ?? r?.receiver.address ?? null,
        quantity: r ? Number(r.quantity) : null,
        distanceKm: d.distanceKm != null ? Number(d.distanceKm) : null,
        scheduledAt: r?.deliveryScheduledAt ?? null,
        shipperName: d.shipper?.user.fullName ?? null,
        shipperPhone: d.shipper?.user.phone ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        minutesSinceUpdate: stalledMinutes,
        claimExpiresAt:
          d.status === 'pending_assignment'
            ? claimDeadline(d.createdAt, r?.deliveryScheduledAt, claimWindowMinutes, scheduledCutoffMinutes)
            : null,
        failedReason: d.failedReason,
      };
    });

    const count = (g: string) => rows.filter((r) => r.group === g).length;
    return {
      stalledAfterMinutes: STALLED_AFTER_MINUTES,
      unclaimedLookbackDays: UNCLAIMED_LOOKBACK_DAYS,
      counts: {
        waiting: count('waiting'),
        active: count('active'),
        stalled: count('stalled'),
        unclaimed: count('unclaimed'),
        bulkRuns: bulkRuns.length,
      },
      deliveries: rows,
      bulkRuns: bulkRuns.map((b) => ({
        id: b.id,
        status: b.status,
        listingTitle: b.listing.title,
        providerName: b.provider.businessName,
        shipperName: b.shipper.user.fullName,
        shipperPhone: b.shipper.user.phone,
        quantity: b.quantity,
        quantityDistributed: b.quantityDistributed,
        stops: b._count.stops,
        createdAt: b.createdAt,
        approvedAt: b.approvedAt,
        pickedUpAt: b.pickedUpAt,
      })),
    };
  }

  /** Sự cố shipper báo trên MỌI chiến dịch — admin chỉ xem, tổ chức là bên xử lý. */
  async listCampaignIncidents(status?: string) {
    const rows = await this.prisma.campaignIncident.findMany({
      where: status === 'open' || status === 'resolved' ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        context: true,
        reasonCode: true,
        detail: true,
        photoUrl: true,
        canContinue: true,
        delayMinutes: true,
        actionTaken: true,
        status: true,
        resolvedAt: true,
        resolvedNote: true,
        createdAt: true,
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            charityReceiver: {
              select: { organizationName: true, user: { select: { fullName: true, phone: true } } },
            },
          },
        },
        volunteer: { select: { user: { select: { fullName: true, phone: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      context: r.context,
      reasonCode: r.reasonCode,
      reasonLabel: INCIDENT_REASONS[r.context as keyof typeof INCIDENT_REASONS]?.[r.reasonCode] ?? r.reasonCode,
      detail: r.detail,
      photoUrl: r.photoUrl,
      canContinue: r.canContinue,
      delayMinutes: r.delayMinutes,
      actionTaken: r.actionTaken,
      status: r.status,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      createdAt: r.createdAt,
      minutesOpen: r.status === 'open' ? Math.floor((Date.now() - r.createdAt.getTime()) / 60_000) : null,
      campaignId: r.campaign.id,
      campaignTitle: r.campaign.title,
      campaignStatus: r.campaign.status,
      organizationName: r.campaign.charityReceiver.organizationName ?? r.campaign.charityReceiver.user.fullName,
      organizationPhone: r.campaign.charityReceiver.user.phone,
      reporterName: r.volunteer.user.fullName,
      reporterPhone: r.volunteer.user.phone,
    }));
  }
}
