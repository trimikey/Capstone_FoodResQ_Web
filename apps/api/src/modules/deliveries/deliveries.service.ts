import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TrustScoreReason } from '@foodresq/types';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { NotificationsGateway } from '@/modules/notifications/notifications.gateway';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { TrustService } from '@/modules/trust/trust.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';

const BROADCAST_RADIUS_M = 5000; // 5km
// Đơn giao không có cập nhật trạng thái quá số giờ này → coi như shipper bỏ ngang, auto-fail
const DELIVERY_STALL_HOURS = 6;

/**
 * Quy một thời điểm về ô ca (ngày VN + 1 trong 4 ca cố định của hệ thống).
 * Dùng để so với ca giao hàng TNV đã đăng ký: đơn "giao ngay" xét theo BÂY GIỜ,
 * đơn hẹn giờ xét theo GIỜ HẸN.
 */
export function deliverySlotAt(at: Date): { workDate: string; period: 'midnight' | 'morning' | 'afternoon' | 'evening' } {
  const vn = new Date(at.getTime() + 7 * 3600_000);
  const hour = vn.getUTCHours();
  const period = hour < 6 ? 'midnight' as const : hour < 12 ? 'morning' as const : hour < 18 ? 'afternoon' as const : 'evening' as const;
  return { workDate: vn.toISOString().slice(0, 10), period };
}

const PERIOD_VN: Record<string, string> = {
  midnight: 'ca khuya', morning: 'ca sáng', afternoon: 'ca chiều', evening: 'ca tối',
};

/**
 * Đơn hẹn giờ đóng cửa nhận trước giờ hẹn bao nhiêu phút.
 *
 * Nhận đúng vào phút hẹn là vô nghĩa: shipper còn phải chạy tới chỗ lấy hàng rồi mới
 * giao được, nhận sát giờ thì chắc chắn trễ hẹn. Cắt sớm 15 phút để đơn không ai nhận
 * kịp thì huỷ sớm, người nhận còn kịp đặt lại thay vì ngồi chờ tới giờ mới biết hỏng.
 */
const SCHEDULED_CLAIM_CUTOFF_MINUTES = 15;

/**
 * Hạn CUỐI còn nhận được một đơn đang chờ.
 *
 * Một chỗ duy nhất cho cả ba nơi cần biết (danh sách đơn gần, lúc bấm nhận, cron dọn
 * đơn quá hạn) — ba công thức riêng sẽ lệch nhau và sinh ra đơn hiện trên app nhưng
 * bấm vào thì báo hết hạn.
 */
export function claimDeadline(
  createdAt: Date,
  scheduledAt: Date | null | undefined,
  claimWindowMinutes: number,
): Date {
  return scheduledAt
    ? new Date(scheduledAt.getTime() - SCHEDULED_CLAIM_CUTOFF_MINUTES * 60_000)
    : new Date(createdAt.getTime() + claimWindowMinutes * 60_000);
}

export interface CampaignTransportSummary {
  id: string;
  status: string;
  campaignId: string;
  campaignTitle: string;
  providerName: string;
  providerAddress: string | null;
  kitchenAddress: string;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private gateway: NotificationsGateway,
    private notifications: NotificationsService,
    private trust: TrustService,
    private systemConfig: SystemConfigService,
  ) {}

  /** Lưu ảnh proof (QC/giao hàng) của shipper, trả về URL. */
  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'delivery-proofs');
  }

  private normalizeQrToken(qrToken: string): string {
    return qrToken.trim().replace(/[\s-]/g, '').toLowerCase();
  }

  private reservationQrMatches(input: string, storedQrToken: string): boolean {
    const normalizedInput = this.normalizeQrToken(input);
    const normalizedStored = this.normalizeQrToken(storedQrToken);
    if (normalizedInput === normalizedStored) return true;
    return /^[0-9a-f]{6,16}$/.test(normalizedInput) && normalizedStored.endsWith(normalizedInput);
  }

  /**
   * Delivery này có phải chuyến của chiến dịch không.
   * Chỉ đụng tới `id`/`delivery_id` — hai cột luôn tồn tại — nên an toàn kể cả khi
   * DB chưa có các cột lifecycle.
   */
  private async hasCampaignTransport(
    client: Prisma.TransactionClient | PrismaService,
    deliveryId: string,
  ): Promise<boolean> {
    const rows = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM campaign_transports WHERE delivery_id = ${deliveryId}::uuid LIMIT 1
    `);
    return rows.length > 0;
  }

  private async syncCampaignTransport(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    status: 'pending' | 'assigned' | 'heading_to_provider' | 'picked_up' | 'in_transit' | 'delivered' | 'failed',
    failureReason?: string,
  ) {
    // Đơn lẻ không có dòng campaign_transports — UPDATE dưới đây sẽ khớp 0 dòng,
    // nhưng Postgres vẫn phân tích câu lệnh và nổ 42703 nếu thiếu cột lifecycle.
    // Thoát sớm để vòng đời đơn lẻ hoàn toàn độc lập với bảng của chiến dịch.
    if (!(await this.hasCampaignTransport(tx, deliveryId))) return;

    const stateRank = {
      pending: 0,
      assigned: 1,
      heading_to_provider: 2,
      picked_up: 3,
      in_transit: 4,
      delivered: 5,
      failed: 6,
    } as const;

    await tx.$executeRaw(Prisma.sql`
      UPDATE campaign_transports
      SET
        status = ${status},
        assigned_at = CASE WHEN ${status} = 'assigned' THEN COALESCE(assigned_at, NOW()) ELSE assigned_at END,
        picked_up_at = CASE WHEN ${status} = 'picked_up' THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
        delivered_at = CASE WHEN ${status} = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
        failed_at = CASE WHEN ${status} = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
        failure_reason = CASE WHEN ${status} = 'failed' THEN ${failureReason ?? null} ELSE failure_reason END,
        updated_at = NOW()
      WHERE delivery_id = ${deliveryId}::uuid
        AND status <> 'received'
        AND (
          (${status} = 'failed' AND status NOT IN ('delivered', 'failed'))
          OR (
            ${status} <> 'failed'
            AND CASE status
              WHEN 'pending' THEN 0
              WHEN 'assigned' THEN 1
              WHEN 'heading_to_provider' THEN 2
              WHEN 'picked_up' THEN 3
              WHEN 'in_transit' THEN 4
              WHEN 'delivered' THEN 5
              WHEN 'failed' THEN 6
              ELSE -1
            END <= ${stateRank[status]}
          )
        )
    `);
  }

  private async notifyCampaignTransport(
    deliveryId: string,
    status: 'assigned' | 'heading_to_provider' | 'picked_up' | 'in_transit' | 'delivered' | 'failed',
  ) {
    const [transport] = await this.prisma.$queryRaw<
      { transport_id: string; campaign_id: string; campaign_title: string; charity_user_id: string; provider_user_id: string }[]
    >(Prisma.sql`
      SELECT
        ct.id AS transport_id,
        cpr.campaign_id,
        kc.title AS campaign_title,
        charity.user_id AS charity_user_id,
        provider.user_id AS provider_user_id
      FROM campaign_transports ct
      JOIN campaign_provider_requests cpr ON cpr.id = ct.provider_request_id
      JOIN kitchen_campaigns kc ON kc.id = cpr.campaign_id
      JOIN receiver_profiles charity ON charity.id = cpr.receiver_id
      JOIN provider_profiles provider ON provider.id = cpr.provider_id
      WHERE ct.delivery_id = ${deliveryId}::uuid
    `);
    if (!transport) return;

    const messages = {
      assigned: ['Đã có TNV nhận chuyến hàng', `Một tình nguyện viên sẽ đến lấy hàng cho chiến dịch "${transport.campaign_title}".`],
      heading_to_provider: ['TNV đang đến điểm lấy hàng', `TNV giao hàng đang đến nhận thực phẩm cho chiến dịch "${transport.campaign_title}".`],
      picked_up: ['Thực phẩm đã được nhận', `TNV đã nhận thực phẩm và chuẩn bị giao đến bếp của chiến dịch "${transport.campaign_title}".`],
      in_transit: ['Thực phẩm đang được giao', `TNV đang giao thực phẩm đến bếp của chiến dịch "${transport.campaign_title}".`],
      delivered: ['Chờ xác nhận đã nhận hàng', `TNV đã giao thực phẩm đến bếp cho chiến dịch "${transport.campaign_title}". Vui lòng xác nhận đã nhận hàng.`],
      failed: ['Chuyến vận chuyển không hoàn tất', `Chuyến vận chuyển thực phẩm cho chiến dịch "${transport.campaign_title}" đã thất bại.`],
    } as const;
    const [title, body] = messages[status];
    await this.notifications.notify(transport.charity_user_id, {
      type: 'campaign',
      title,
      body,
      data: { campaignId: transport.campaign_id, transportId: transport.transport_id, deliveryId, status },
    });
    if (status === 'delivered' || status === 'failed') {
      await this.notifications.notify(transport.provider_user_id, {
        type: 'campaign',
        title,
        body,
        data: { campaignId: transport.campaign_id, transportId: transport.transport_id, deliveryId, status },
      });
    }
  }

  /** TNV có ca giao hàng phủ thời điểm này không (điều kiện để nhận đơn). */
  private async hasDeliveryShiftCovering(volunteerId: string, at: Date): Promise<boolean> {
    const slot = deliverySlotAt(at);
    const found = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM delivery_shift_registrations
      WHERE volunteer_id = ${volunteerId}::uuid
        AND work_date = ${slot.workDate}::date
        AND period = ${slot.period}::campaign_shift_period
      LIMIT 1
    `);
    return found.length > 0;
  }

  /**
   * TNV có ca CHIẾN DỊCH đã xác nhận trùng đúng khung giờ này không.
   *
   * Role đã gộp nên một người vừa đăng ký ca giao vừa nhận lời mời chiến dịch được —
   * nhưng không thể ở hai nơi cùng lúc: đã xác nhận ca bếp thì khung đó coi như BẬN,
   * không nhận đơn giao lẻ nữa.
   */
  private async isBusyWithCampaignShift(
    volunteerId: string,
    slot: { workDate: string; period: string },
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a.id
      FROM campaign_volunteer_assignments a
      JOIN campaign_shifts cs ON cs.id = a.shift_id
      WHERE a.volunteer_id = ${volunteerId}::uuid
        AND a.work_date = ${slot.workDate}::date
        AND cs.period = ${slot.period}::campaign_shift_period
        AND a.status IN ('assigned', 'checked_in', 'in_progress')
        AND a.confirmation_status = 'confirmed'
      LIMIT 1
    `);
    return rows.length > 0;
  }

  /** Xác minh đủ điều kiện làm shipper (dùng chung cho danh sách đơn + nhận đơn). */
  private async requireVerifiedShipper(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
      select: {
        id: true,
        verificationStatus: true,
        user: { select: { status: true } },
        specializations: { select: { specialization: true, isVerified: true } },
      },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    const shipperOk = volunteer.specializations.some(
      (sp) => sp.specialization === 'shipper' && sp.isVerified,
    );
    if (volunteer.user.status !== 'active' || volunteer.verificationStatus !== 'approved' || !shipperOk) {
      throw new ForbiddenException('Tài khoản chưa được xác minh chuyên môn giao hàng.');
    }
    return volunteer;
  }

  /**
   * Đơn đang chờ shipper trong bán kính 5km quanh vị trí hiện tại của TNV.
   *
   * Mô hình MỚI thay cho mời tuần tự 15s: shipper trong ca tự xem danh sách và
   * CHỌN đơn muốn giao. Toạ độ lấy từ FE lúc gọi (GPS tươi) thay vì cột
   * current_location vốn chỉ được cập nhật khi còn dùng nút bật/tắt sẵn sàng.
   */
  async getNearbyPendingDeliveries(shipperUserId: string, lng: number, lat: number) {
    const volunteer = await this.requireVerifiedShipper(shipperUserId);

    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      created_at: Date;
      distance_m: number;
      trip_km: number | null;
      listing_title: string;
      pickup_address: string;
      image_urls: unknown;
      delivery_address: string | null;
      receiver_address: string | null;
      delivery_scheduled_at: Date | null;
      evidence_url: string | null;
    }>>(Prisma.sql`
      SELECT d.id,
             d.created_at,
             ST_Distance(d.pickup_location::geography, ST_MakePoint(${lng}, ${lat})::geography) AS distance_m,
             d.distance_km::float8 AS trip_km,
             fl.title AS listing_title,
             fl.pickup_address,
             fl.image_urls,
             r.delivery_address,
             rp.address AS receiver_address,
             r.delivery_scheduled_at,
             r.delivery_evidence_url AS evidence_url
      FROM deliveries d
      JOIN reservations r ON r.id = d.reservation_id
      JOIN food_listings fl ON fl.id = r.listing_id
      LEFT JOIN receiver_profiles rp ON rp.id = r.receiver_id
      WHERE d.status = 'pending_assignment'
        AND d.shipper_id IS NULL
        AND d.pickup_location IS NOT NULL
        AND ST_DWithin(
          d.pickup_location::geography,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${BROADCAST_RADIUS_M}
        )
      ORDER BY r.delivery_scheduled_at ASC NULLS FIRST, d.created_at ASC
      LIMIT 30
    `);

    // Gắn cờ "ca của bạn có phủ đơn này không" để FE giải thích vì sao nút mờ,
    // thay vì để bấm rồi mới ăn lỗi.
    // Hạn đơn: đơn hẹn giờ chờ tới giờ hẹn; đơn giao ngay chờ hết cửa sổ nhận.
    // Trả về để client đếm ngược "đơn còn chờ được bao lâu" (không phải hạn trả lời
    // lời mời như hệ cũ — mô hình mới không mời ai cả).
    const claimWindowMinutes = await this.systemConfig.getNumber('DELIVERY_CLAIM_WINDOW_MINUTES');
    const results: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      // Bỏ đơn đã qua hạn nhận: cron dọn theo chu kỳ nên chúng còn `pending_assignment`
      // thêm một lúc — vẫn hiện thì shipper bấm vào chỉ nhận được lỗi.
      const expiresAt = claimDeadline(row.created_at, row.delivery_scheduled_at, claimWindowMinutes);
      if (Date.now() > expiresAt.getTime()) continue;

      const targetAt = row.delivery_scheduled_at ?? new Date();
      const slot = deliverySlotAt(targetAt);
      const covered = await this.hasDeliveryShiftCovering(volunteer.id, targetAt);
      // Đã xác nhận ca chiến dịch trùng khung → coi như bận, không cho nhận đơn lẻ.
      const busyWithCampaign = covered && (await this.isBusyWithCampaignShift(volunteer.id, slot));
      results.push({
        deliveryId: row.id,
        createdAt: row.created_at,
        distanceKm: Math.round((row.distance_m / 1000) * 10) / 10,
        tripKm: row.trip_km,
        listingTitle: row.listing_title,
        pickupAddress: row.pickup_address,
        imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
        deliveryAddress: row.delivery_address ?? row.receiver_address,
        deliveryScheduledAt: row.delivery_scheduled_at,
        deliveryEvidenceUrl: row.evidence_url,
        canClaim: covered && !busyWithCampaign,
        busyWithCampaign,
        claimSlot: slot,
        claimExpiresAt: expiresAt,
      });
    }
    return results;
  }

  /**
   * Shipper TỰ NHẬN một đơn đang chờ — thay cho bấm chấp nhận lời mời 15s.
   *
   * Điều kiện cốt lõi: phải có CA GIAO HÀNG đã đăng ký phủ thời điểm giao
   * (đơn hẹn giờ xét theo giờ hẹn, đơn giao ngay xét theo bây giờ) — đúng cam kết
   * "chọn đơn đi giao trong lịch đã đăng ký".
   */
  async claimDelivery(deliveryId: string, shipperUserId: string) {
    const volunteer = await this.requireVerifiedShipper(shipperUserId);

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { reservation: { select: { deliveryScheduledAt: true } } },
    });
    if (!delivery || !delivery.reservationId) throw new NotFoundException('Không tìm thấy đơn giao.');
    if (delivery.status !== 'pending_assignment' || delivery.shipperId) {
      throw new BadRequestException('Đơn này đã có người nhận hoặc không còn chờ giao.');
    }

    // Cron dọn đơn quá hạn chạy theo chu kỳ nên luôn có khe: đơn đã qua hạn vẫn còn
    // `pending_assignment` cho tới lượt quét kế tiếp. Không chặn ở đây thì shipper nhận
    // được đơn mà hệ thống đang chuẩn bị huỷ — nhận xong bị giật mất giữa chừng.
    const claimWindowMinutes = await this.systemConfig.getNumber('DELIVERY_CLAIM_WINDOW_MINUTES');
    const deadline = claimDeadline(
      delivery.createdAt,
      delivery.reservation?.deliveryScheduledAt,
      claimWindowMinutes,
    );
    if (Date.now() > deadline.getTime()) {
      throw new BadRequestException(
        delivery.reservation?.deliveryScheduledAt
          ? `Đơn này đã hết hạn nhận (đóng trước giờ hẹn ${SCHEDULED_CLAIM_CUTOFF_MINUTES} phút).`
          : 'Đơn này đã hết hạn nhận.',
      );
    }

    const targetAt = delivery.reservation?.deliveryScheduledAt ?? new Date();
    const slot = deliverySlotAt(targetAt);
    if (!(await this.hasDeliveryShiftCovering(volunteer.id, targetAt))) {
      throw new BadRequestException(
        `Bạn chưa đăng ký ${PERIOD_VN[slot.period]} ngày ${slot.workDate} — chỉ nhận được đơn nằm trong ca đã đăng ký.`,
      );
    }
    if (await this.isBusyWithCampaignShift(volunteer.id, slot)) {
      throw new BadRequestException(
        `Bạn đã xác nhận một ca chiến dịch trong ${PERIOD_VN[slot.period]} ngày ${slot.workDate} — khung giờ này đang bận, không nhận thêm đơn giao lẻ được.`,
      );
    }

    // Mỗi shipper một đơn đang giao; đang chạy giao sỉ thì không nhận đơn lẻ.
    const existingActive = await this.prisma.delivery.findFirst({
      where: {
        shipperId: volunteer.id,
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
      },
      select: { id: true },
    });
    if (existingActive) {
      throw new BadRequestException('Bạn đang có một đơn giao chưa hoàn tất. Hãy hoàn tất đơn hiện tại trước.');
    }
    const activeBulk = await this.prisma.bulkRun.findFirst({
      where: { shipperId: volunteer.id, status: { in: ['approved', 'picked_up'] } },
      select: { id: true },
    });
    if (activeBulk) {
      throw new BadRequestException('Bạn đang chạy một chuyến giao sỉ. Hoàn tất chuyến trước khi nhận đơn lẻ.');
    }

    await this.prisma.$transaction(async (tx) => {
      const assigned = await tx.delivery.updateMany({
        where: { id: deliveryId, status: 'pending_assignment', shipperId: null },
        data: { shipperId: volunteer.id, status: 'assigned', assignedAt: new Date() },
      });
      if (assigned.count !== 1) {
        throw new ConflictException('Đơn này vừa được shipper khác nhận trước bạn.');
      }
      // Đơn có thể còn lời mời cũ (giai đoạn chuyển tiếp) — đóng hết để không ai bấm nhầm.
      await tx.shipperTaskOffer.updateMany({
        where: { deliveryId, status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      });
      await this.syncCampaignTransport(tx, deliveryId, 'assigned');
    });

    const updated = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        reservation: { include: { receiver: { include: { user: true } }, listing: true } },
        shipper: { include: { user: true } },
      },
    });
    if (updated?.reservation?.receiver?.userId) {
      this.gateway.emitToUser(updated.reservation.receiver.userId, 'delivery:assigned', {
        reservationId: updated.reservationId,
        deliveryId,
        shipperName: updated.shipper?.user.fullName ?? 'TNV',
        shipperPhone: updated.shipper?.user.phone,
      });
      void this.notifications.notify(updated.reservation.receiver.userId, {
        type: 'delivery',
        title: 'Đã có tình nguyện viên nhận đơn',
        body:
          `${updated.shipper?.user.fullName ?? 'Tình nguyện viên'} sẽ giao "${updated.reservation.listing.title}" cho bạn`
          + (updated.reservation.deliveryScheduledAt
            ? ` vào ${new Date(updated.reservation.deliveryScheduledAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`
            : ' trong ít phút tới.'),
        data: { reservationId: updated.reservationId, deliveryId, status: 'assigned' },
      });
    }
    return updated;
  }

  async updateStatus(
    deliveryId: string,
    shipperUserId: string,
    newStatus: string,
    proofUrl?: string,
    qrToken?: string,
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        reservation: { select: { id: true, qrToken: true, receiver: { select: { userId: true } } } },
      },
    });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();

    const transitions: Record<string, string> = {
      assigned: 'heading_to_provider',
      heading_to_provider: 'qc_completed',
      qc_completed: 'in_transit',
      in_transit: 'delivered',
    };

    if (transitions[delivery.status] !== newStatus) {
      throw new BadRequestException('Không thể chuyển sang trạng thái này từ trạng thái hiện tại của đơn.');
    }

    const updateData: Prisma.DeliveryUpdateInput = { status: newStatus as never };

    if (newStatus === 'qc_completed') {
      // `qc_completed` CHÍNH LÀ thời điểm shipper cầm được hàng. Trước đây cột này
      // không ai ghi (4/112 đơn có giá trị, toàn từ luồng bulk-run) nên mọi báo cáo
      // về thời gian lấy hàng phải lách qua `qc_photo_at` — mà ảnh QC là tuỳ chọn.
      updateData.pickedUpAt = new Date();
      if (proofUrl) {
        updateData.qcPhotoUrl = proofUrl;
        updateData.qcPhotoAt = new Date();
      }
    }

    // ── Late pickup penalty: trừ trust nếu lấy muộn quá ngưỡng (campaign transport) ──
    if (newStatus === 'qc_completed' && !delivery.reservation && delivery.providerRequestId) {
      const request = await this.prisma.campaignProviderRequest.findUnique({
        where: { id: delivery.providerRequestId },
        select: { pickupStartTime: true, campaignId: true },
      });
      if (request?.pickupStartTime) {
        const [h, m] = request.pickupStartTime.split(':').map(Number);
        const nowVN = new Date(Date.now() + 7 * 3600_000);
        // pickupStartTime hôm nay theo giờ VN
        const deadline = new Date(nowVN);
        deadline.setUTCHours(h - 7 + (h < 7 ? 24 : 0), m, 0, 0);
        // Nếu deadline đã qua (pickupStart < giờ hiện tại → deadline < nowVN → muộn)
        const lateMinutes = Math.max(0, (nowVN.getTime() - deadline.getTime()) / 60_000);
        const threshold = await this.systemConfig.getNumber('DELIVERY_LATE_PICKUP_THRESHOLD_MINUTES');
        const penalty = await this.systemConfig.getNumber('DELIVERY_LATE_PICKUP_PENALTY');
        if (lateMinutes >= threshold && penalty > 0) {
          void this.trust.applyDelta(
            volunteer.userId,
            -penalty,
            TrustScoreReason.LATE_PICKUP,
            'delivery',
            deliveryId,
          );
        }
      }
    }

    if (newStatus === 'delivered') {
      if (!delivery.reservation) {
        if (!proofUrl) {
          throw new BadRequestException('Chuyến giao đến bếp cần ảnh xác nhận bàn giao.');
        }
        updateData.deliveredAt = new Date();
        updateData.deliveryProofUrl = proofUrl;
        updateData.deliveryProofAt = new Date();
        const updated = await this.prisma.$transaction(async (tx) => {
          const result = await tx.delivery.update({ where: { id: deliveryId }, data: updateData });
          await tx.volunteerProfile.update({ where: { id: volunteer.id }, data: { isAvailable: true } });
          await this.syncCampaignTransport(tx, deliveryId, 'delivered');

          // Hoàn thành assignment của shipper trong chiến dịch
          const [request] = await tx.$queryRaw<{ campaign_id: string }[]>`
            SELECT campaign_id FROM campaign_provider_requests WHERE id = ${delivery.providerRequestId}::uuid
          `;
          if (request) {
            await tx.campaignVolunteerAssignment.updateMany({
              where: {
                campaignId: request.campaign_id,
                volunteerId: volunteer.id,
                role: 'shipper',
                status: { in: ['assigned', 'checked_in', 'in_progress'] },
              },
              data: { status: 'completed', pointsAwarded: 10 },
            });
          }
          return result;
        });
        void this.notifyCampaignTransport(deliveryId, 'delivered');
        return updated;
      }

      // Không kiểm tra qr_expires_at — QR của đơn giao là mã xác nhận bàn giao,
      // giao hàng thường lâu hơn 30 phút hiệu lực gốc.
      if (!qrToken) {
        throw new BadRequestException(
          'Cần quét mã QR trên màn hình của người nhận để xác nhận bàn giao đúng người.',
        );
      }
      if (!this.reservationQrMatches(qrToken, delivery.reservation.qrToken)) {
        throw new BadRequestException(
          'Mã QR không khớp với đơn này. Hãy quét mã trong trang theo dõi đơn của người nhận.',
        );
      }

      updateData.deliveredAt = new Date();
      if (proofUrl) {
        updateData.deliveryProofUrl = proofUrl;
        updateData.deliveryProofAt = new Date();
      }

      // Mark reservation as completed + award dedication points (ảnh proof là tùy chọn)
      // delivery.reservation đã được narrow non-null bởi block if ở trên.
      const reservationId = delivery.reservationId as string;
      await this.prisma.$transaction([
        this.prisma.reservation.update({
          where: { id: reservationId },
          data: { status: 'completed' },
        }),
        this.prisma.volunteerProfile.update({
          where: { id: volunteer.id },
          data: { isAvailable: true, dedicationPoints: { increment: 5 } },
        }),
        this.prisma.dedicationPointsHistory.create({
          data: {
            volunteerId: volunteer.id,
            delta: 5,
            reason: 'delivery_completed',
            referenceType: 'delivery',
            referenceId: deliveryId,
            pointsBefore: volunteer.dedicationPoints,
            pointsAfter: volunteer.dedicationPoints + 5,
          },
        }),
      ]);

      // Giải cứu thành công → +2 trust cho người nhận (đồng nhất với luồng tự đến lấy)
      void this.trust.applyDelta(
        delivery.reservation.receiver.userId,
        2,
        TrustScoreReason.SUCCESSFUL_RESCUE,
        'reservation',
        delivery.reservation.id,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.delivery.update({ where: { id: deliveryId }, data: updateData });
      if (!delivery.reservation) {
        const transportStatus = newStatus === 'qc_completed' ? 'picked_up' : newStatus;
        await this.syncCampaignTransport(
          tx,
          deliveryId,
          transportStatus as 'heading_to_provider' | 'picked_up' | 'in_transit',
        );
      }
      return result;
    });
    if (!delivery.reservation) {
      const transportStatus = newStatus === 'qc_completed' ? 'picked_up' : newStatus;
      void this.notifyCampaignTransport(
        deliveryId,
        transportStatus as 'heading_to_provider' | 'picked_up' | 'in_transit',
      );
    }
    return updated;
  }

  /** Shipper huỷ nhận đơn TRƯỚC khi lấy hàng → đơn quay lại 'chờ nhận' + báo shipper khác. */
  async cancelAssignment(deliveryId: string, shipperUserId: string, reason?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId: shipperUserId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();
    if (!['assigned', 'heading_to_provider'].includes(delivery.status)) {
      throw new BadRequestException('Chỉ huỷ được khi chưa lấy hàng. Sau khi đã lấy hàng, hãy báo giao thất bại.');
    }

    await this.prisma.$transaction([
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { shipperId: null, status: 'pending_assignment', assignedAt: null },
      }),
      this.prisma.volunteerProfile.update({
        where: { id: volunteer.id },
        data: { isAvailable: true },
      }),
      this.prisma.shipperTaskOffer.updateMany({
        where: { deliveryId, shipperId: volunteer.id, status: 'accepted' },
        data: { status: 'rejected', rejectReason: reason ?? 'Shipper huỷ nhận đơn', respondedAt: new Date() },
      }),
      ...(delivery.reservationId
        ? []
        : [
            this.prisma.$executeRaw(Prisma.sql`
              UPDATE campaign_transports
              SET
                status = 'pending',
                assigned_at = NULL,
                picked_up_at = NULL,
                delivered_at = NULL,
                failed_at = NULL,
                failure_reason = NULL,
                updated_at = NOW()
              WHERE delivery_id = ${deliveryId}::uuid
                AND status IN ('assigned', 'heading_to_provider')
            `),
          ]),
    ]);

    // Đơn trở về trạng thái chờ — tự hiện lại trong danh sách "Đơn giao gần bạn"
    // của các shipper đang trong ca (trang poll 20s), không cần mời lại tuần tự.
    return { id: deliveryId, status: 'pending_assignment' };
  }

  /** Người nhận huỷ tìm shipper → đánh dấu delivery = cancelled, reservation giữ nguyên để tự đến lấy. */
  async cancelDeliverySearchByReceiver(deliveryId: string, userId: string) {
    // reservations.receiver_id trỏ tới receiver_profiles.id, KHÔNG phải users.id →
    // phải map userId sang profile id trước khi so sánh (giống getTrackingForReceiver).
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { reservation: true },
    });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');

    // Check cả 2 cách: receiver_id = receiver_profiles.id HOẶC = users.id (một số bản ghi cũ có thể là users.id).
    const receiverMatch =
      delivery.reservation?.receiverId === receiver.id ||
      delivery.reservation?.receiverId === userId;
    if (!receiverMatch) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }

    if (!['pending_assignment', 'assigned'].includes(delivery.status)) {
      throw new BadRequestException('Không thể huỷ: đơn đang trong quá trình giao hàng.');
    }

    await this.prisma.$transaction([
      // Expire các offer đang chờ
      this.prisma.shipperTaskOffer.updateMany({
        where: { deliveryId, status: 'pending' },
        data: { status: 'expired' },
      }),
      // Đánh dấu delivery = cancelled (không xoá) để FE polling vẫn nhận được status
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { status: 'cancelled' },
      }),
    ]);

    return { id: deliveryId, status: 'cancelled', message: 'Đã hủy tìm shipper. Bạn có thể đến lấy trực tiếp.' };
  }

  /** Shipper báo giao THẤT BẠI (sau khi đã lấy hàng) — bắt buộc lý do. */
  async failDelivery(deliveryId: string, shipperUserId: string, reason?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId: shipperUserId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (!reason || !reason.trim()) throw new BadRequestException('Vui lòng nhập lý do giao thất bại.');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();
    if (!['qc_completed', 'in_transit'].includes(delivery.status)) {
      throw new BadRequestException('Chỉ báo thất bại sau khi đã lấy hàng (QC xong).');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({ where: { id: deliveryId }, data: { status: 'failed', failedReason: reason.trim() } });
      await tx.volunteerProfile.update({ where: { id: volunteer.id }, data: { isAvailable: true } });
      if (delivery.reservationId) {
        await tx.reservation.update({
          where: { id: delivery.reservationId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: `Giao hàng thất bại: ${reason.trim()}`,
          },
        });
      } else {
        await this.syncCampaignTransport(tx, deliveryId, 'failed', reason.trim());
      }
    });
    if (!delivery.reservationId) void this.notifyCampaignTransport(deliveryId, 'failed');
    return { id: deliveryId, status: 'failed' };
  }

  /**
   * Cron: auto-fail các đơn giao KẸT — shipper đã nhận nhưng không cập nhật trạng thái
   * quá DELIVERY_STALL_HOURS giờ (bỏ ngang giữa chừng).
   * - Chưa lấy hàng (assigned/heading_to_provider): hàng vẫn ở provider → hoàn số lượng listing.
   * - Đã lấy hàng (qc_completed/in_transit): hàng đã rời bếp → không hoàn số lượng.
   * - Giải phóng shipper (is_available=true); reservation đang `confirmed` → `expired`
   *   (không phạt trust người nhận — không phải lỗi của họ).
   */
  async expireStalledDeliveries(): Promise<number> {
    const cutoff = new Date(Date.now() - DELIVERY_STALL_HOURS * 60 * 60 * 1000);
    const stalled = await this.prisma.delivery.findMany({
      where: {
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
        updatedAt: { lt: cutoff },
      },
      include: {
        reservation: { select: { id: true, status: true, quantity: true, listingId: true } },
      },
      take: 100,
    });

    for (const d of stalled) {
      const beforePickup = d.status === 'assigned' || d.status === 'heading_to_provider';
      const ops: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.delivery.update({
          where: { id: d.id },
          data: {
            status: 'failed',
            failedReason: `Tự động huỷ: đơn không được cập nhật trạng thái trong ${DELIVERY_STALL_HOURS} giờ.`,
          },
        }),
      ];
      if (d.shipperId) {
        ops.push(
          this.prisma.volunteerProfile.update({
            where: { id: d.shipperId },
            data: { isAvailable: true },
          }),
        );
      }
      if (!d.reservation) {
        const reason = `Tự động huỷ: đơn không được cập nhật trạng thái trong ${DELIVERY_STALL_HOURS} giờ.`;
        await this.prisma.$transaction(async (tx) => {
          await tx.delivery.update({
            where: { id: d.id },
            data: { status: 'failed', failedReason: reason },
          });
          if (d.shipperId) {
            await tx.volunteerProfile.update({ where: { id: d.shipperId }, data: { isAvailable: true } });
            await tx.shipperTaskOffer.updateMany({
              where: { deliveryId: d.id, shipperId: d.shipperId, status: 'accepted' },
              data: { status: 'expired', respondedAt: new Date(), rejectReason: reason },
            });
          }
          await this.syncCampaignTransport(tx, d.id, 'failed', reason);
        });
        void this.notifyCampaignTransport(d.id, 'failed');
        continue;
      }
      if (d.reservation.status === 'confirmed') {
        ops.push(
          this.prisma.reservation.update({
            where: { id: d.reservation.id },
            data: { status: 'expired' },
          }),
        );
      }
      if (beforePickup) {
        ops.push(
          this.prisma.$executeRaw(Prisma.sql`
            UPDATE food_listings
            SET
              quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(d.reservation.quantity)}),
              status = 'active'::listing_status,
              updated_at = NOW()
            WHERE id = ${d.reservation.listingId}::uuid
          `),
        );
      }
      await this.prisma.$transaction(ops);
    }

    return stalled.length;
  }

  /**
   * Cron: (1) đóng các offer `pending` đã quá hạn thành `expired`;
   * (2) đơn `pending_assignment` còn hiệu lực (reservation chưa hết hạn QR)
   * mà không còn offer nào đang chờ → mời tuần tự shipper đủ điều kiện tiếp theo.
   */
  /**
   * Quá ASSIGNMENT_TIMEOUT_MS (4ph30) mà chưa shipper nào nhận → dừng tìm:
   * đóng delivery + offer, huỷ reservation (hoàn số lượng, trả daily count,
   * KHÔNG phạt trust) và báo người nhận đặt lại.
   */
  private async failUnassignedTimeouts(): Promise<number> {
    // Mô hình tự nhận đơn: hạn chờ KHÔNG còn là 4ph30 cứng.
    //  - Đơn giao ngay: chờ DELIVERY_CLAIM_WINDOW_MINUTES (admin chỉnh, mặc định 30ph).
    //  - Đơn hẹn giờ:   chờ tới đúng giờ hẹn — quá giờ mà không ai nhận mới huỷ.
    const claimWindowMinutes = await this.systemConfig.getNumber('DELIVERY_CLAIM_WINDOW_MINUTES');
    const now = Date.now();
    const candidates = await this.prisma.delivery.findMany({
      where: { status: 'pending_assignment' },
      include: {
        reservation: {
          select: {
            id: true,
            quantity: true,
            listingId: true,
            receiverId: true,
            deliveryScheduledAt: true,
            receiver: { select: { userId: true } },
            listing: { select: { title: true } },
          },
        },
      },
      take: 100,
    });
    const stale = candidates.filter(
      (d) =>
        now > claimDeadline(d.createdAt, d.reservation?.deliveryScheduledAt, claimWindowMinutes).getTime(),
    );

    for (const d of stale) {
      const reason = 'Không có tình nguyện viên nào nhận đơn trong thời gian tìm kiếm.';
      if (!d.reservation) {
        await this.prisma.$transaction(async (tx) => {
          await tx.delivery.update({ where: { id: d.id }, data: { status: 'failed', failedReason: reason } });
          await tx.shipperTaskOffer.updateMany({
            where: { deliveryId: d.id, status: 'pending' },
            data: { status: 'expired', respondedAt: new Date(), rejectReason: reason },
          });
          await this.syncCampaignTransport(tx, d.id, 'failed', reason);
        });
        void this.notifyCampaignTransport(d.id, 'failed');
        continue;
      }

      await this.prisma.$transaction([
        this.prisma.delivery.update({
          where: { id: d.id },
          data: { status: 'failed', failedReason: reason },
        }),
        this.prisma.shipperTaskOffer.updateMany({
          where: { deliveryId: d.id, status: 'pending' },
          data: { status: 'expired', respondedAt: new Date() },
        }),
        this.prisma.reservation.update({
          where: { id: d.reservation.id },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: 'Không có tình nguyện viên nào nhận đơn giao. Vui lòng đặt lại.',
          },
        }),
        this.prisma.$executeRaw(Prisma.sql`
          UPDATE food_listings
          SET
            quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(d.reservation.quantity)}),
            status = 'active'::listing_status,
            updated_at = NOW()
          WHERE id = ${d.reservation.listingId}::uuid
        `),
        this.prisma.receiverProfile.updateMany({
          where: { id: d.reservation.receiverId, reservationsToday: { gt: 0 } },
          data: { reservationsToday: { decrement: 1 } },
        }),
      ]);

      void this.notifications.notify(d.reservation.receiver.userId, {
        type: 'delivery',
        title: 'Không tìm được tình nguyện viên',
        body: `Rất tiếc, chưa có tình nguyện viên nào nhận giao đơn "${d.reservation.listing.title}". Vui lòng yêu cầu lại hoặc chọn tự đến lấy.`,
        data: { reservationId: d.reservation.id, status: 'failed' },
      });
      this.gateway.emitToUser(d.reservation.receiver.userId, 'delivery:unassigned', {
        reservationId: d.reservation.id,
      });
    }

    return stale.length;
  }
  /**
   * Huỷ các đơn không ai nhận đúng hạn (đơn ngay: hết cửa sổ chờ; đơn hẹn giờ:
   * quá giờ hẹn) và dọn lời mời cũ còn treo từ hệ mời tuần tự đã gỡ bỏ.
   */
  async expireUnclaimedDeliveries(): Promise<number> {
    const expired = await this.failUnassignedTimeouts();
    // Dọn dữ liệu: hàng lời mời cũ (trước khi chuyển sang mô hình tự chọn đơn)
    // còn pending sẽ treo mãi vì không còn cron nào đụng tới.
    await this.prisma.shipperTaskOffer.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired', respondedAt: new Date() },
    });
    return expired;
  }

  /** Lấy toạ độ lấy hàng / giao hàng (cột geography) cho danh sách delivery. */
  private async getDeliveryCoords(ids: string[]) {
    if (ids.length === 0) return new Map<string, { pickupLng: number | null; pickupLat: number | null; deliveryLng: number | null; deliveryLat: number | null }>();
    const rows = await this.prisma.$queryRaw<
      { id: string; plng: number | null; plat: number | null; dlng: number | null; dlat: number | null }[]
    >(Prisma.sql`
      SELECT id,
        ST_X(pickup_location::geometry) AS plng, ST_Y(pickup_location::geometry) AS plat,
        ST_X(delivery_location::geometry) AS dlng, ST_Y(delivery_location::geometry) AS dlat
      FROM deliveries WHERE id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
    `);
    return new Map(
      rows.map((r) => [r.id, { pickupLng: r.plng, pickupLat: r.plat, deliveryLng: r.dlng, deliveryLat: r.dlat }]),
    );
  }

  private async getCampaignTransportSummaries(deliveryIds: string[]): Promise<Map<string, CampaignTransportSummary>> {
    if (deliveryIds.length === 0) return new Map<string, CampaignTransportSummary>();
    const rows = await this.prisma.$queryRaw<{
      delivery_id: string;
      id: string;
      status: string;
      campaign_id: string;
      campaign_title: string;
      provider_name: string;
      provider_address: string | null;
      kitchen_address: string;
      pickup_start_time: string | null;
      pickup_end_time: string | null;
    }[]>(Prisma.sql`
      SELECT
        ct.delivery_id,
        ct.id,
        ct.status,
        cpr.campaign_id,
        kc.title AS campaign_title,
        pp.business_name AS provider_name,
        pp.address AS provider_address,
        kc.kitchen_address,
        cpr.pickup_start_time,
        cpr.pickup_end_time
      FROM campaign_transports ct
      JOIN campaign_provider_requests cpr ON cpr.id = ct.provider_request_id
      JOIN kitchen_campaigns kc ON kc.id = cpr.campaign_id
      JOIN provider_profiles pp ON pp.id = cpr.provider_id
      WHERE ct.delivery_id IN (${Prisma.join(deliveryIds.map((id) => Prisma.sql`${id}::uuid`))})
    `);
    return new Map(rows.map((row) => [row.delivery_id, {
      id: row.id,
      status: row.status,
      campaignId: row.campaign_id,
      campaignTitle: row.campaign_title,
      providerName: row.provider_name,
      providerAddress: row.provider_address,
      kitchenAddress: row.kitchen_address,
      pickupStartTime: row.pickup_start_time,
      pickupEndTime: row.pickup_end_time,
    }]));
  }

  private sourceAwareDelivery<T extends {
    id: string;
    reservation: {
      listing: { pickupAddress: string };
      receiver: { address: string | null } | null;
      deliveryAddress?: string | null;
    } | null;
    coords?: { pickupLng: number | null; pickupLat: number | null; deliveryLng: number | null; deliveryLat: number | null } | null;
  }>(delivery: T, campaignTransport?: CampaignTransportSummary) {
    const reservation = delivery.reservation;
    const pickupAddress = reservation?.listing.pickupAddress ?? campaignTransport?.providerAddress ?? null;
    // Điểm giao riêng của đơn (người nhận đang nằm viện / ở nhà người thân) phải
    // thắng địa chỉ mặc định trong hồ sơ — nếu không shipper sẽ chạy nhầm chỗ.
    const destinationAddress =
      reservation?.deliveryAddress?.trim()
      || reservation?.receiver?.address
      || campaignTransport?.kitchenAddress
      || null;
    return {
      ...delivery,
      source: reservation ? 'reservation' as const : 'campaign_transport' as const,
      reservation,
      campaignTransport: campaignTransport ?? null,
      pickup: {
        address: pickupAddress,
        lng: delivery.coords?.pickupLng ?? null,
        lat: delivery.coords?.pickupLat ?? null,
      },
      destination: {
        address: destinationAddress,
        lng: delivery.coords?.deliveryLng ?? null,
        lat: delivery.coords?.deliveryLat ?? null,
      },
    };
  }

  async getMyActiveDelivery(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findFirst({
      where: {
        shipperId: volunteer.id,
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
      },
      include: {
        reservation: {
          include: {
            listing: {
              select: { title: true, pickupAddress: true, imageUrls: true, quantityUnit: true },
            },
            receiver: {
              select: {
                address: true,
                // Ảnh đã đăng ký + CCCD: shipper đối chiếu đúng người trước khi
                // bàn giao, giống bước provider quét QR cho đơn tự đến lấy.
                faceImageUrl: true,
                idCardImageUrl: true,
                idCardNumber: true,
                user: { select: { fullName: true, phone: true } },
              },
            },
          },
        },
      },
    });
    if (!delivery) return null;
    const coords = (await this.getDeliveryCoords([delivery.id])).get(delivery.id) ?? null;
    const transports = await this.getCampaignTransportSummaries([delivery.id]);
    return this.sourceAwareDelivery({ ...delivery, coords }, transports.get(delivery.id));
  }

  /** Lịch sử giao hàng của shipper (đã giao / thất bại) — phân trang server-side. */
  async getMyDeliveryHistory(shipperUserId: string, opts: { page?: number; limit?: number } = {}) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId: shipperUserId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 20, 100);
    const where: Prisma.DeliveryWhereInput = {
      shipperId: volunteer.id,
      status: { in: ['delivered', 'failed'] },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [{ deliveredAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          reservation: {
            include: {
              listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
              receiver: { include: { user: { select: { fullName: true } } } },
            },
          },
        },
      }),
      this.prisma.delivery.count({ where }),
    ]);

    const [coords, transports] = await Promise.all([
      this.getDeliveryCoords(items.map((item) => item.id)),
      this.getCampaignTransportSummaries(items.map((item) => item.id)),
    ]);
    return {
      items: items.map((item) => this.sourceAwareDelivery(
        { ...item, coords: coords.get(item.id) ?? null },
        transports.get(item.id),
      )),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Bảng thành tích shipper (kiểu dashboard tài xế Grab/Xanh SM). */
  async getMyStats(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
      select: { id: true, dedicationPoints: true, rank: true, avgRating: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [delivered, failed, todayDelivered, kmAgg] = await this.prisma.$transaction([
      this.prisma.delivery.count({ where: { shipperId: volunteer.id, status: 'delivered' } }),
      this.prisma.delivery.count({ where: { shipperId: volunteer.id, status: 'failed' } }),
      this.prisma.delivery.count({
        where: { shipperId: volunteer.id, status: 'delivered', deliveredAt: { gte: startOfToday } },
      }),
      this.prisma.delivery.aggregate({
        where: { shipperId: volunteer.id, status: 'delivered' },
        _sum: { distanceKm: true },
      }),
    ]);

    const attempts = delivered + failed;
    return {
      totalDelivered: delivered,
      todayDelivered,
      totalFailed: failed,
      completionRate: attempts > 0 ? Math.round((delivered / attempts) * 100) : null,
      totalKm: Math.round(Number(kmAgg._sum.distanceKm ?? 0) * 10) / 10,
      dedicationPoints: volunteer.dedicationPoints,
      rank: volunteer.rank,
      avgRating: volunteer.avgRating != null ? Number(volunteer.avgRating) : null,
    };
  }

  /**
   * Đánh giá mà shipper đã NHẬN được từ người nhận, kèm phân bố sao.
   * Rating là bảng đa hình nên nối sang reservation/listing bằng raw query.
   */
  async getMyRatings(shipperUserId: string, page = 1, limit = 10) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
      select: { id: true, avgRating: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const skip = (page - 1) * limit;
    const items = await this.prisma.$queryRaw<
      {
        id: string;
        score: number;
        comment: string | null;
        created_at: Date;
        listing_title: string | null;
        rater_name: string | null;
      }[]
    >(Prisma.sql`
      SELECT rt.id, rt.score, rt.comment, rt.created_at,
             fl.title AS listing_title,
             u.full_name AS rater_name
      FROM ratings rt
      JOIN users u ON u.id = rt.rater_id
      LEFT JOIN reservations r ON r.id = rt.reference_id
      LEFT JOIN food_listings fl ON fl.id = r.listing_id
      WHERE rt.reference_type = 'reservation' AND rt.ratee_id = ${shipperUserId}::uuid
      ORDER BY rt.created_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `);

    const [dist] = await this.prisma.$queryRaw<
      { total: bigint; s5: bigint; s4: bigint; s3: bigint; s2: bigint; s1: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE score = 5) AS s5,
             COUNT(*) FILTER (WHERE score = 4) AS s4,
             COUNT(*) FILTER (WHERE score = 3) AS s3,
             COUNT(*) FILTER (WHERE score = 2) AS s2,
             COUNT(*) FILTER (WHERE score = 1) AS s1
      FROM ratings
      WHERE reference_type = 'reservation' AND ratee_id = ${shipperUserId}::uuid
    `);

    const total = Number(dist?.total ?? 0);
    return {
      items: items.map((r) => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        createdAt: r.created_at,
        listingTitle: r.listing_title,
        raterName: r.rater_name,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      avgRating: volunteer.avgRating != null ? Number(volunteer.avgRating) : null,
      distribution: {
        5: Number(dist?.s5 ?? 0),
        4: Number(dist?.s4 ?? 0),
        3: Number(dist?.s3 ?? 0),
        2: Number(dist?.s2 ?? 0),
        1: Number(dist?.s1 ?? 0),
      },
    };
  }

  /** Người nhận theo dõi đơn giao của mình: trạng thái + vị trí shipper trực tiếp. */
  async getTrackingForReceiver(reservationId: string, receiverUserId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId: receiverUserId }, select: { id: true } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const delivery = await this.prisma.delivery.findUnique({
      where: { reservationId },
      include: {
        reservation: { select: { receiverId: true, deliveryScheduledAt: true, listing: { select: { title: true, pickupAddress: true } } } },
        shipper: { select: { id: true, user: { select: { fullName: true, phone: true } } } },
      },
    });
    if (!delivery) throw new NotFoundException('Đơn này chưa có thông tin giao hàng.');
    if (!delivery.reservation) throw new BadRequestException('Đơn này không gắn với đặt suất ăn.');
    if (delivery.reservation.receiverId !== receiver.id) throw new ForbiddenException();

    // Khi delivery bị cancelled (receiver hủy tìm shipper), vẫn trả về status để FE nhận biết
    if (delivery.status === 'cancelled') {
      return {
        deliveryId: delivery.id,
        status: 'cancelled' as const,
        failedReason: 'Người nhận đã hủy tìm shipper.',
        searchExpiresAt: null,
        shipper: null,
        coords: null,
        distanceKm: null,
      };
    }

    let coords = (await this.getDeliveryCoords([delivery.id])).get(delivery.id) ?? null;

    // Fallback: đơn cũ chưa được ghi sẵn toạ độ vào deliveries → lấy trực tiếp
    // từ listing (điểm lấy) và receiver_profiles (điểm giao) để FE vẫn vẽ được bản đồ.
    if (
      coords == null ||
      coords.pickupLng == null || coords.pickupLat == null ||
      coords.deliveryLng == null || coords.deliveryLat == null
    ) {
      const [fb] = await this.prisma.$queryRaw<
        { plng: number | null; plat: number | null; dlng: number | null; dlat: number | null }[]
      >(Prisma.sql`
        SELECT
          ST_X(fl.pickup_location::geometry) AS plng, ST_Y(fl.pickup_location::geometry) AS plat,
          ST_X(rp.location::geometry) AS dlng, ST_Y(rp.location::geometry) AS dlat
        FROM reservations r
        JOIN food_listings fl ON fl.id = r.listing_id
        LEFT JOIN receiver_profiles rp ON rp.id = r.receiver_id
        WHERE r.id = ${reservationId}::uuid
      `);
      if (fb) {
        coords = {
          pickupLng: coords?.pickupLng ?? fb.plng,
          pickupLat: coords?.pickupLat ?? fb.plat,
          deliveryLng: coords?.deliveryLng ?? fb.dlng,
          deliveryLat: coords?.deliveryLat ?? fb.dlat,
        };
      }
    }

    let shipperLocation: { lng: number; lat: number } | null = null;
    if (delivery.shipperId) {
      const [row] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(Prisma.sql`
        SELECT ST_X(current_location::geometry) AS lng, ST_Y(current_location::geometry) AS lat
        FROM volunteer_profiles WHERE id = ${delivery.shipperId}::uuid
      `);
      if (row?.lng != null && row?.lat != null) shipperLocation = { lng: row.lng, lat: row.lat };
    }

    return {
      deliveryId: delivery.id,
      status: delivery.status,
      failedReason: delivery.failedReason,
      // Hạn tìm shipper TUYỆT ĐỐI, tính từ lúc tạo đơn — để FE đếm ngược theo mốc
      // này thay vì đếm từ lúc mở trang (reload sẽ nhảy về 4:30 dù đã tìm gần hết giờ).
      searchExpiresAt:
        delivery.status === 'pending_assignment'
          ? (delivery.reservation.deliveryScheduledAt
              ? delivery.reservation.deliveryScheduledAt.toISOString()
              : new Date(
                  delivery.createdAt.getTime()
                    + (await this.systemConfig.getNumber('DELIVERY_CLAIM_WINDOW_MINUTES')) * 60_000,
                ).toISOString())
          : null,
      deliveryScheduledAt: delivery.reservation.deliveryScheduledAt?.toISOString() ?? null,
      distanceKm: delivery.distanceKm != null ? Number(delivery.distanceKm) : null,
      listingTitle: delivery.reservation.listing.title,
      pickupAddress: delivery.reservation.listing.pickupAddress,
      coords,
      shipper: delivery.shipper
        ? { name: delivery.shipper.user.fullName, phone: delivery.shipper.user.phone, location: shipperLocation }
        : null,
    };
  }
}
