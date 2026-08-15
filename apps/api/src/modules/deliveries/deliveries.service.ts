import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { TrustScoreReason } from '@foodresq/types';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { NotificationsGateway } from '@/modules/notifications/notifications.gateway';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { TrustService } from '@/modules/trust/trust.service';

// Cửa sổ phản hồi của shipper. Theo mô hình gọi xe (mời lần lượt từng người,
// đếm ngược ngắn) — để 2 phút thì một tài khoản không phản hồi chặn trọn 2 phút
// của hàng đợi.
export const OFFER_EXPIRY_SECONDS = 15;
const BROADCAST_RADIUS_M = 5000; // 5km
// Đơn giao không có cập nhật trạng thái quá số giờ này → coi như shipper bỏ ngang, auto-fail
const DELIVERY_STALL_HOURS = 6;
// Tìm shipper tối đa 4 phút 30 giây — quá hạn không ai nhận thì đóng đơn,
// báo người nhận "không có tình nguyện viên nào nhận, vui lòng đặt lại".
export const ASSIGNMENT_TIMEOUT_MS = 270 * 1000;
// SUY RA từ hai hằng số trên, không đặt tay: trần số lượt phải đủ lấp kín cửa sổ
// tìm kiếm. Đặt cứng 5 với cửa sổ 15s thì quota cạn sau 75s, đơn nằm im hơn 3 phút
// còn lại dù vẫn còn shipper hợp lệ chưa được mời.
export const MAX_OFFERS_PER_DELIVERY = Math.ceil(
  ASSIGNMENT_TIMEOUT_MS / (OFFER_EXPIRY_SECONDS * 1000),
);

interface NearbyShipper {
  id: string;
  user_id: string;
  distance_m: number;
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
    @InjectQueue('notification-push') private notifQueue: Queue,
    private gateway: NotificationsGateway,
    private notifications: NotificationsService,
    private trust: TrustService,
  ) {}

  /** Lưu ảnh proof (QC/giao hàng) của shipper, trả về URL. */
  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'delivery-proofs');
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

  /**
   * Shipper để lời mời trôi qua (không bấm nhận, cũng không bấm từ chối) → tắt
   * chế độ sẵn sàng.
   *
   * Người thực sự đang online sẽ bấm một trong hai nút; im lặng hết cửa sổ nghĩa
   * là không có ai ngồi trước máy. Để nguyên `is_available = true` thì tài khoản
   * đó tiếp tục đứng đầu hàng đợi của mọi đơn kế tiếp và chặn shipper thật.
   *
   * TỪ CHỐI TƯỜNG MINH KHÔNG BỊ TẮT — đó là phản hồi hợp lệ.
   *
   * NGOẠI LỆ: shipper vừa hoàn thành đơn trong 60 giây qua không bị tắt — offer
   * có thể đến trong cửa sổ chuyển tiếp ngắn và không phản ánh "bỏ qua cố tình".
   */
  private async goOfflineAfterLapse(shipperIds: string[]) {
    const ids = [...new Set(shipperIds)];
    if (ids.length === 0) return;

    // Exempt shippers who completed a delivery within the last 60 seconds.
    const graceCutoff = new Date(Date.now() - 60_000);
    const recentlyCompleted = await this.prisma.delivery.findMany({
      where: { shipperId: { in: ids }, status: 'delivered', deliveredAt: { gte: graceCutoff } },
      select: { shipperId: true },
    });
    const exemptIds = new Set(recentlyCompleted.map((d) => d.shipperId).filter(Boolean) as string[]);
    const idsToProcess = ids.filter((id) => !exemptIds.has(id));
    if (idsToProcess.length === 0) return;

    const affected = await this.prisma.volunteerProfile.updateMany({
      where: { id: { in: idsToProcess }, isAvailable: true },
      data: { isAvailable: false },
    });
    if (affected.count === 0) return;

    const shippers = await this.prisma.volunteerProfile.findMany({
      where: { id: { in: idsToProcess } },
      select: { id: true, userId: true },
    });
    for (const s of shippers) {
      this.gateway.emitToUser(s.userId, 'shipper:auto_offline', { reason: 'offer_lapsed' });
      await this.notifications.notify(s.userId, {
        type: 'delivery',
        title: 'Đã tắt chế độ nhận đơn',
        body: 'Bạn không phản hồi lời mời giao hàng trong thời gian cho phép nên hệ thống đã tắt chế độ sẵn sàng. Bật lại khi bạn muốn tiếp tục nhận đơn.',
        data: { reason: 'offer_lapsed' },
      });
    }
  }

  private async notifyTaskOffer(shipper: NearbyShipper, deliveryId: string, expiresAt: Date) {
    void this.notifQueue.add(
      'delivery-offer-timeout',
      { shipperId: shipper.id, deliveryId, expiresAt },
      { delay: OFFER_EXPIRY_SECONDS * 1000, removeOnComplete: true },
    );
    this.gateway.emitToUser(shipper.user_id, 'delivery:offer', { deliveryId });
  }

  private async offerNextNearestShipper(deliveryId: string, pickupLng: number, pickupLat: number) {
    const now = new Date();
    const lapsed = await this.prisma.shipperTaskOffer.findMany({
      where: { deliveryId, status: 'pending', expiresAt: { lte: now } },
      select: { shipperId: true },
    });
    if (lapsed.length > 0) {
      await this.prisma.shipperTaskOffer.updateMany({
        where: { deliveryId, status: 'pending', expiresAt: { lte: now } },
        data: { status: 'expired', respondedAt: now, rejectReason: 'Offer timeout' },
      });
      await this.goOfflineAfterLapse(lapsed.map((o) => o.shipperId));
    }

    const shippers = await this.prisma.$queryRaw<NearbyShipper[]>(Prisma.sql`
      SELECT
        vp.id,
        vp.user_id AS user_id,
        ST_Distance(
          vp.current_location::geography,
          ST_MakePoint(${pickupLng}, ${pickupLat})::geography
        ) AS distance_m
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      JOIN volunteer_specializations vs ON vs.volunteer_id = vp.id
        AND vs.specialization = 'shipper'
        AND vs.is_verified = TRUE
      WHERE vp.is_available = TRUE
        AND vp.verification_status = 'approved'
        AND vp.current_location IS NOT NULL
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM shipper_task_offers existing
          WHERE existing.delivery_id = ${deliveryId}::uuid
            AND existing.shipper_id = vp.id
        )
        AND ST_DWithin(
          vp.current_location::geography,
          ST_MakePoint(${pickupLng}, ${pickupLat})::geography,
          ${BROADCAST_RADIUS_M}
        )
      ORDER BY distance_m ASC
      LIMIT 1
    `);

    const shipper = shippers[0];
    if (!shipper) return null;

    const expiresAt = new Date(now.getTime() + OFFER_EXPIRY_SECONDS * 1000);
    const inserted = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO shipper_task_offers (delivery_id, shipper_id, status, expires_at)
      SELECT ${deliveryId}::uuid, ${shipper.id}::uuid, 'pending'::offer_status, ${expiresAt.toISOString()}::timestamptz
      WHERE EXISTS (
        SELECT 1
        FROM deliveries
        WHERE id = ${deliveryId}::uuid
          AND status = 'pending_assignment'
          AND shipper_id IS NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM shipper_task_offers
          WHERE delivery_id = ${deliveryId}::uuid
            AND status = 'pending'
        )
        AND (
          SELECT COUNT(*)
          FROM shipper_task_offers
          WHERE delivery_id = ${deliveryId}::uuid
        ) < ${MAX_OFFERS_PER_DELIVERY}
      ON CONFLICT (delivery_id, shipper_id) DO NOTHING
    `);
    if (inserted !== 1) return null;

    await this.notifyTaskOffer(shipper, deliveryId, expiresAt);
    return shipper;
  }

  // Called after reservation created with requestDelivery=true. Kept as public API for the queue processor.
  async broadcastToNearbyShippers(deliveryId: string, pickupLng: number, pickupLat: number) {
    const shipper = await this.offerNextNearestShipper(deliveryId, pickupLng, pickupLat);
    if (!shipper) return;

    // Mốc broadcast chỉ tồn tại cho chuyến của chiến dịch — đơn lẻ không có dòng
    // campaign_transports nào, nên không chạm vào bảng đó.
    if (!(await this.hasCampaignTransport(this.prisma, deliveryId))) return;

    // Bookkeeping thuần: offer đã được tạo và socket `delivery:offer` đã bắn ở trên.
    // Lỗi ở đây KHÔNG được phép làm job fail — job retry sẽ bị guard "đã có offer
    // pending" chặn nên sẽ không emit lại lần nào nữa, shipper mất popup.
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE campaign_transports
        SET last_broadcast_at = NOW(), updated_at = NOW()
        WHERE delivery_id = ${deliveryId}::uuid
      `);
    } catch (err) {
      this.logger.warn(
        `Không ghi được mốc broadcast cho delivery ${deliveryId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async acceptOffer(deliveryId: string, shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId: volunteer.id } },
    });

    if (!offer) throw new NotFoundException('Không tìm thấy lời mời giao hàng.');
    if (offer.status !== 'pending') throw new BadRequestException('Lời mời này không còn hiệu lực (đã được phản hồi hoặc hết hạn).');
    if (new Date() > offer.expiresAt) throw new BadRequestException('Lời mời giao hàng đã hết hạn.');

    // Mỗi shipper chỉ giữ 1 đơn đang giao tại một thời điểm
    const existingActive = await this.prisma.delivery.findFirst({
      where: {
        shipperId: volunteer.id,
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
      },
      select: { id: true },
    });
    if (existingActive) {
      throw new BadRequestException(
        'Bạn đang có một đơn giao chưa hoàn tất. Hãy hoàn tất đơn hiện tại trước khi nhận đơn mới.',
      );
    }

    // Đang chạy chuyến giao sỉ thì không nhận thêm đơn lẻ (guard chéo với bulk-runs)
    const activeBulk = await this.prisma.bulkRun.findFirst({
      where: { shipperId: volunteer.id, status: { in: ['approved', 'picked_up'] } },
      select: { id: true },
    });
    if (activeBulk) {
      throw new BadRequestException(
        'Bạn đang chạy một chuyến giao sỉ. Hoàn tất chuyến trước khi nhận đơn lẻ.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const claimedVolunteer = await tx.volunteerProfile.updateMany({
        where: { id: volunteer.id, isAvailable: true },
        data: { isAvailable: false },
      });
      if (claimedVolunteer.count !== 1) {
        throw new ConflictException('Bạn đã nhận một đơn giao khác.');
      }

      const assigned = await tx.delivery.updateMany({
        where: {
          id: deliveryId,
          status: 'pending_assignment',
          shipperId: null,
        },
        data: {
          shipperId: volunteer.id,
          status: 'assigned',
          assignedAt: new Date(),
        },
      });

      if (assigned.count !== 1) {
        throw new ConflictException('Đơn này đã được shipper khác nhận.');
      }

      const accepted = await tx.shipperTaskOffer.updateMany({
        where: { id: offer.id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      if (accepted.count !== 1) {
        throw new ConflictException('Lời mời này không còn hiệu lực.');
      }

      await tx.shipperTaskOffer.updateMany({
        where: { deliveryId, id: { not: offer.id }, status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      });

      await this.syncCampaignTransport(tx, deliveryId, 'assigned');
    });

    // Realtime: báo cho receiver biết có shipper nhận rồi
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
    } else {
      void this.notifyCampaignTransport(deliveryId, 'assigned');
    }

    return updated;
  }

  async rejectOffer(deliveryId: string, shipperUserId: string, reason?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId: volunteer.id } },
    });

    if (!offer || offer.status !== 'pending') {
      throw new BadRequestException('Không có lời mời giao hàng nào đang chờ.');
    }

    const coords = (await this.getDeliveryCoords([deliveryId])).get(deliveryId);

    await this.prisma.$transaction(async (tx) => {
      const rejected = await tx.shipperTaskOffer.updateMany({
        where: { id: offer.id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: 'rejected', respondedAt: new Date(), rejectReason: reason ?? 'Shipper bỏ qua' },
      });
      if (rejected.count !== 1) {
        throw new BadRequestException('Lời mời này không còn hiệu lực.');
      }
    });

    if (coords?.pickupLng != null && coords?.pickupLat != null) {
      await this.offerNextNearestShipper(deliveryId, coords.pickupLng, coords.pickupLat);
    }

    return { message: 'Offer rejected' };
  }

  async expireOfferAndOfferNext(deliveryId: string, shipperId: string, expiresAt?: string) {
    const expectedExpiry = expiresAt ? new Date(expiresAt) : undefined;
    if (expectedExpiry && Number.isNaN(expectedExpiry.getTime())) return;

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId } },
      select: { id: true, status: true, expiresAt: true },
    });
    if (
      !offer
      || offer.status !== 'pending'
      || offer.expiresAt > new Date()
      || (expectedExpiry && offer.expiresAt.getTime() !== expectedExpiry.getTime())
    ) return;

    const coords = (await this.getDeliveryCoords([deliveryId])).get(deliveryId);
    const expired = await this.prisma.shipperTaskOffer.updateMany({
      where: { id: offer.id, status: 'pending', expiresAt: offer.expiresAt },
      data: { status: 'expired', respondedAt: new Date(), rejectReason: 'Offer timeout' },
    });
    if (expired.count !== 1) return;

    // Để trôi lời mời → tắt sẵn sàng, trước khi chuyển lượt cho người kế tiếp.
    await this.goOfflineAfterLapse([shipperId]);

    if (coords?.pickupLng != null && coords?.pickupLat != null) {
      await this.offerNextNearestShipper(deliveryId, coords.pickupLng, coords.pickupLat);
    }
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

    if (newStatus === 'qc_completed' && proofUrl) {
      updateData.qcPhotoUrl = proofUrl;
      updateData.qcPhotoAt = new Date();
    }

    // ── Late pickup penalty: trừ trust nếu lấy muộn ≥ 60 phút (campaign transport) ──
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
        const LATE_THRESHOLD_MIN = 60;
        if (lateMinutes >= LATE_THRESHOLD_MIN) {
          void this.trust.applyDelta(
            volunteer.userId,
            -10,
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
      if (qrToken.trim() !== delivery.reservation.qrToken) {
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

    // Mời lại các shipper khác gần điểm lấy hàng
    const coords = (await this.getDeliveryCoords([deliveryId])).get(deliveryId);
    if (coords?.pickupLng != null && coords?.pickupLat != null) {
      await this.broadcastToNearbyShippers(deliveryId, coords.pickupLng, coords.pickupLat);
    }
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
    const cutoff = new Date(Date.now() - ASSIGNMENT_TIMEOUT_MS);
    const stale = await this.prisma.delivery.findMany({
      where: {
        status: 'pending_assignment',
        createdAt: { lt: cutoff },
      },
      include: {
        reservation: {
          select: {
            id: true,
            quantity: true,
            listingId: true,
            receiverId: true,
            receiver: { select: { userId: true } },
            listing: { select: { title: true } },
          },
        },
      },
      take: 50,
    });

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

  async sweepOffersAndRebroadcast(): Promise<number> {
    // Bỏ cuộc các đơn đã tìm quá 4ph30 TRƯỚC, để không mời lại vô ích
    await this.failUnassignedTimeouts();

    // RETURNING để biết ai đã để trôi lời mời → tắt sẵn sàng cho họ.
    const lapsed = await this.prisma.$queryRaw<{ shipper_id: string }[]>(Prisma.sql`
      UPDATE shipper_task_offers
      SET status = 'expired'::offer_status, responded_at = NOW()
      WHERE status = 'pending' AND expires_at < NOW()
      RETURNING shipper_id
    `);
    await this.goOfflineAfterLapse(lapsed.map((o) => o.shipper_id));

    const stuck = await this.prisma.$queryRaw<
      { id: string; plng: number | null; plat: number | null }[]
    >(Prisma.sql`
      SELECT d.id,
             ST_X(COALESCE(d.pickup_location, fl.pickup_location)::geometry) AS plng,
             ST_Y(COALESCE(d.pickup_location, fl.pickup_location)::geometry) AS plat
      FROM deliveries d
      LEFT JOIN reservations r ON r.id = d.reservation_id
      LEFT JOIN food_listings fl ON fl.id = r.listing_id
      LEFT JOIN campaign_transports ct ON ct.delivery_id = d.id
      WHERE d.status = 'pending_assignment'
        AND (
          (r.id IS NOT NULL AND r.status = 'confirmed' AND r.qr_expires_at > NOW())
          OR (ct.id IS NOT NULL AND ct.status = 'pending')
        )
        AND NOT EXISTS (
          SELECT 1 FROM shipper_task_offers o
          WHERE o.delivery_id = d.id AND o.status = 'pending'
        )
      LIMIT 20
    `);

    for (const d of stuck) {
      if (d.plng != null && d.plat != null) {
        await this.broadcastToNearbyShippers(d.id, Number(d.plng), Number(d.plat));
      }
    }

    return stuck.length;
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
    reservation: { listing: { pickupAddress: string }; receiver: { address: string | null } | null } | null;
    coords?: { pickupLng: number | null; pickupLat: number | null; deliveryLng: number | null; deliveryLat: number | null } | null;
  }>(delivery: T, campaignTransport?: CampaignTransportSummary) {
    const reservation = delivery.reservation;
    const pickupAddress = reservation?.listing.pickupAddress ?? campaignTransport?.providerAddress ?? null;
    const destinationAddress = reservation?.receiver?.address ?? campaignTransport?.kitchenAddress ?? null;
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
            listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
            receiver: {
              select: { address: true, user: { select: { fullName: true, phone: true } } },
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
        reservation: { select: { receiverId: true, listing: { select: { title: true, pickupAddress: true } } } },
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
          ? new Date(delivery.createdAt.getTime() + ASSIGNMENT_TIMEOUT_MS).toISOString()
          : null,
      distanceKm: delivery.distanceKm != null ? Number(delivery.distanceKm) : null,
      listingTitle: delivery.reservation.listing.title,
      pickupAddress: delivery.reservation.listing.pickupAddress,
      coords,
      shipper: delivery.shipper
        ? { name: delivery.shipper.user.fullName, phone: delivery.shipper.user.phone, location: shipperLocation }
        : null,
    };
  }

  async getMyPendingOffers(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const offers = await this.prisma.shipperTaskOffer.findMany({
      where: {
        shipperId: volunteer.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      include: {
        delivery: {
          include: {
            reservation: {
              include: {
                listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
                receiver: { select: { address: true } },
              },
            },
          },
        },
      },
      orderBy: { offeredAt: 'asc' },
    });

    const [coordsMap, transports] = await Promise.all([
      this.getDeliveryCoords(offers.map((offer) => offer.deliveryId)),
      this.getCampaignTransportSummaries(offers.map((offer) => offer.deliveryId)),
    ]);
    return offers.map((offer) => ({
      ...offer,
      delivery: this.sourceAwareDelivery(
        { ...offer.delivery, coords: coordsMap.get(offer.deliveryId) ?? null },
        transports.get(offer.deliveryId),
      ),
    }));
  }
}
