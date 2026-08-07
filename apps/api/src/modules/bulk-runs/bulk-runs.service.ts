import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import Redlock from 'redlock';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { TrustService } from '@/modules/trust/trust.service';
import { RequestBulkRunDto, AddStopDto, UpdateStopDto, ServeStopDto } from './dto/bulk-run.dto';

// UUID cố định cho placeholder receiver — hệ thống tự tạo user/receiver profile khi app khởi động.
const BULK_PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000001';

// Ngưỡng giao sỉ: từ số phần này trở lên mới được yêu cầu (CLAUDE.md-style constant)
export const BULK_MIN_QTY = 2;
// ── Hạn chót từng giai đoạn ───────────────────────────────────────────────────
// Đều là hạn TUYỆT ĐỐI tính từ mốc vào giai đoạn, KHÔNG dựa trên `updatedAt`:
// nếu dựa vào lần cập nhật cuối, shipper chỉ cần thao tác lặt vặt là gia hạn vô hạn
// trong khi hàng vẫn nằm im và kho vẫn bị giữ.
export const REQUEST_EXPIRY_HOURS = 24; // NCC phải duyệt/từ chối trong 24h
export const PICKUP_DEADLINE_HOURS = 4; // đã duyệt → phải đến lấy hàng (kho đang bị giữ)
export const RUN_COMPLETION_HOURS = 8;  // đã lấy hàng → phải phát xong
// Huỷ chuyến SAU KHI NCC đã duyệt → phạt uy tín (bằng mức huỷ trễ của đơn lẻ).
// Huỷ khi còn chờ duyệt thì không phạt vì chưa gây thiệt hại cho ai.
export const BULK_CANCEL_PENALTY = 10;

const ACTIVE_RUN_STATUSES = ['requested', 'approved', 'picked_up'] as const;
const ACTIVE_DELIVERY_STATUSES = ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] as const;

@Injectable()
export class BulkRunsService implements OnModuleInit {
  // Cache placeholder receiver ID sau khi upsert
  private bulkPlaceholderReceiverId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private redlock: Redlock,
    private storage: StorageService,
    private notifications: NotificationsService,
    private systemConfig: SystemConfigService,
    private trust: TrustService,
  ) {}

  /** Chạy 1 lần khi module khởi tạo — đảm bảo placeholder receiver luôn tồn tại. */
  async onModuleInit() {
    await this.getBulkPlaceholderReceiverId();
  }

  /** Lazy-init và cache placeholder receiver ID. */
  private async getBulkPlaceholderReceiverId(): Promise<string> {
    if (this.bulkPlaceholderReceiverId) return this.bulkPlaceholderReceiverId;

    // Tạo placeholder user bằng raw SQL (bypass passwordHash bắt buộc của User.create)
    // Cung cấp dummy password_hash vì đây là system account không bao giờ dùng để login
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at)
      VALUES (
        ${BULK_PLACEHOLDER_USER_ID}::uuid,
        'bulk-run@foodresq.internal',
        'BULK_RUN_PLACEHOLDER_HASH',
        'Hệ thống — Giao sỉ (Bulk)',
        'receiver',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
    `);

    // Upsert receiver profile bằng Prisma (userId là @unique nên hoạt động)
    await this.prisma.receiverProfile.upsert({
      where: { userId: BULK_PLACEHOLDER_USER_ID },
      create: {
        userId: BULK_PLACEHOLDER_USER_ID,
        isCharityOrg: true,
        organizationName: 'Tổ chức từ thiện (Bulk Run)',
        verificationStatus: 'approved',
        verifiedAt: new Date(),
      },
      update: {},
    });

    const profile = await this.prisma.receiverProfile.findUnique({
      where: { userId: BULK_PLACEHOLDER_USER_ID },
      select: { id: true },
    });
    this.bulkPlaceholderReceiverId = profile!.id;
    return profile!.id;
  }

  /** Tạo QR token đơn giản dạng hex (không cần JWT). */
  private makeQrToken(runId: string, stopId: string): string {
    const ts = Date.now().toString(16);
    const rand = randomBytes(8).toString('hex');
    return `br-${runId.slice(0, 8)}-${stopId.slice(0, 8)}-${ts}-${rand}`;
  }

  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'bulk-proofs');
  }

  /** Shipper đã xác minh chuyên môn mới được giao sỉ (số lượng lớn cần tin cậy). */
  private async resolveVerifiedShipper(userId: string) {
    const vp = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        specializations: { select: { specialization: true, isVerified: true } },
      },
    });
    if (!vp) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    const ok = vp.specializations.some((s) => s.specialization === 'shipper' && s.isVerified);
    if (!ok) {
      throw new ForbiddenException('Chỉ tình nguyện viên giao hàng đã được xác minh mới nhận giao sỉ.');
    }
    return vp;
  }

  private async resolveProvider(userId: string) {
    const p = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true },
    });
    if (!p) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');
    return p;
  }

  /** Hoàn kho một phần/quả về listing (dùng chung cho reject/cancel/leftover). */
  private restockSql(listingId: string, qty: number) {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE food_listings
      SET
        quantity_remaining = LEAST(quantity_total, quantity_remaining + ${qty}),
        status = CASE WHEN status = 'fully_reserved'::listing_status THEN 'active'::listing_status ELSE status END,
        updated_at = NOW()
      WHERE id = ${listingId}::uuid
    `);
  }

  /** Toạ độ các điểm phát (geography → raw SQL) theo danh sách run. */
  private async getStopCoords(runIds: string[]) {
    if (runIds.length === 0) return new Map<string, { lng: number; lat: number }>();
    const rows = await this.prisma.$queryRaw<{ id: string; lng: number | null; lat: number | null }[]>(
      Prisma.sql`
        SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
        FROM bulk_run_stops
        WHERE run_id IN (${Prisma.join(runIds.map((i) => Prisma.sql`${i}::uuid`))})
      `,
    );
    return new Map(
      rows
        .filter((r) => r.lng !== null && r.lat !== null)
        .map((r) => [r.id, { lng: Number(r.lng), lat: Number(r.lat) }]),
    );
  }

  /**
   * Hạn chót của chuyến theo giai đoạn hiện tại — FE dùng để đếm ngược.
   * Trả null khi chuyến đã kết thúc (không còn gì để chờ).
   */
  private runDeadline(run: {
    status: string;
    createdAt: Date;
    approvedAt: Date | null;
    pickedUpAt: Date | null;
  }): Date | null {
    const h = (base: Date, hours: number) => new Date(base.getTime() + hours * 3600 * 1000);
    if (run.status === 'requested') return h(run.createdAt, REQUEST_EXPIRY_HOURS);
    if (run.status === 'approved' && run.approvedAt) return h(run.approvedAt, PICKUP_DEADLINE_HOURS);
    if (run.status === 'picked_up' && run.pickedUpAt) return h(run.pickedUpAt, RUN_COMPLETION_HOURS);
    return null;
  }

  /** Gắn {lng,lat} vào từng stop + toạ độ điểm lấy của listing + hạn chót giai đoạn. */
  private async hydrateRuns<
    T extends {
      id: string;
      listingId: string;
      status: string;
      createdAt: Date;
      approvedAt: Date | null;
      pickedUpAt: Date | null;
      stops: { id: string }[];
    },
  >(runs: T[]) {
    const stopCoords = await this.getStopCoords(runs.map((r) => r.id));
    const listingIds = [...new Set(runs.map((r) => r.listingId))];
    const pickupRows = listingIds.length
      ? await this.prisma.$queryRaw<{ id: string; lng: number | null; lat: number | null }[]>(Prisma.sql`
          SELECT id, ST_X(pickup_location::geometry) AS lng, ST_Y(pickup_location::geometry) AS lat
          FROM food_listings WHERE id IN (${Prisma.join(listingIds.map((i) => Prisma.sql`${i}::uuid`))})
        `)
      : [];
    const pickupMap = new Map(
      pickupRows
        .filter((r) => r.lng !== null)
        .map((r) => [r.id, { lng: Number(r.lng), lat: Number(r.lat) }]),
    );
    return runs.map((r) => ({
      ...r,
      pickupCoords: pickupMap.get(r.listingId) ?? null,
      deadlineAt: this.runDeadline(r),
      stops: r.stops.map((s) => ({
        ...s,
        coords: stopCoords.get(s.id) ?? null,
      })),
    }));
  }

  // ── Shipper: yêu cầu giao sỉ ────────────────────────────────────────────────
  async request(shipperUserId: string, dto: RequestBulkRunDto) {
    const shipper = await this.resolveVerifiedShipper(shipperUserId);

    if (dto.quantity < BULK_MIN_QTY) {
      throw new BadRequestException(`Giao sỉ chỉ áp dụng từ ${BULK_MIN_QTY} phần trở lên.`);
    }

    // 1 shipper chỉ 1 chuyến sỉ đang chạy — và không được kẹt đơn giao lẻ
    const activeRun = await this.prisma.bulkRun.findFirst({
      where: { shipperId: shipper.id, status: { in: [...ACTIVE_RUN_STATUSES] } },
      select: { id: true },
    });
    if (activeRun) throw new BadRequestException('Bạn đang có một chuyến giao sỉ chưa hoàn tất.');
    const activeDelivery = await this.prisma.delivery.findFirst({
      where: { shipperId: shipper.id, status: { in: [...ACTIVE_DELIVERY_STATUSES] } },
      select: { id: true },
    });
    if (activeDelivery) {
      throw new BadRequestException('Bạn đang giao một đơn lẻ — hoàn tất trước khi nhận chuyến giao sỉ.');
    }

    const listing = await this.prisma.foodListing.findFirst({
      where: { id: dto.listingId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        providerId: true,
        pickupEndTime: true,
        quantityRemaining: true,
        provider: { select: { userId: true } },
      },
    });
    if (!listing) throw new NotFoundException('Không tìm thấy tin thực phẩm.');
    if (listing.status !== 'active') throw new BadRequestException('Tin này không còn nhận đặt.');
    if (new Date() > listing.pickupEndTime) throw new BadRequestException('Tin này đã quá giờ nhận hàng.');
    if (Number(listing.quantityRemaining) < dto.quantity) {
      throw new BadRequestException(`Chỉ còn ${Number(listing.quantityRemaining)} phần — không đủ số lượng yêu cầu.`);
    }

    const run = await this.prisma.bulkRun.create({
      data: {
        listingId: listing.id,
        providerId: listing.providerId,
        shipperId: shipper.id,
        quantity: dto.quantity,
        note: dto.note ?? null,
      },
    });

    void this.notifications.notify(listing.provider.userId, {
      type: 'bulk_run',
      title: 'Yêu cầu giao sỉ mới',
      body: `Tình nguyện viên muốn nhận ${dto.quantity} phần "${listing.title}" để phát tại nhiều điểm. Vào trang quản lý để duyệt.`,
      data: { bulkRunId: run.id, status: 'requested' },
    });

    return run;
  }

  // ── Provider: duyệt / từ chối ───────────────────────────────────────────────
  async approve(runId: string, providerUserId: string) {
    const provider = await this.resolveProvider(providerUserId);
    const run = await this.prisma.bulkRun.findUnique({
      where: { id: runId },
      include: {
        listing: { select: { id: true, title: true } },
        shipper: { select: { userId: true } },
      },
    });
    if (!run) throw new NotFoundException('Không tìm thấy yêu cầu giao sỉ.');
    if (run.providerId !== provider.id) throw new ForbiddenException();
    if (run.status !== 'requested') {
      throw new BadRequestException('Yêu cầu này đã được xử lý hoặc không còn hiệu lực.');
    }

    // Khoá listing như luồng reservation để không đụng độ khách đặt lẻ cùng lúc
    const lock = await this.redlock
      .acquire([`lock:reservation:${run.listingId}`], 10_000)
      .catch(() => {
        throw new BadRequestException('Tin đang có người thao tác. Vui lòng thử lại sau vài giây.');
      });
    try {
      const [row] = await this.prisma.$queryRaw<
        { quantity_remaining: number; status: string; pickup_end_time: Date }[]
      >(
        Prisma.sql`SELECT quantity_remaining, status, pickup_end_time FROM food_listings WHERE id = ${run.listingId}::uuid AND deleted_at IS NULL`,
      );
      if (!row || row.status !== 'active') {
        throw new BadRequestException('Tin không còn hiệu lực để duyệt giao sỉ.');
      }
      if (new Date() > row.pickup_end_time) {
        throw new BadRequestException('Tin đã quá giờ nhận hàng — không duyệt được nữa.');
      }
      if (Number(row.quantity_remaining) < run.quantity) {
        throw new BadRequestException(
          `Chỉ còn ${Number(row.quantity_remaining)} phần — không đủ cho yêu cầu ${run.quantity} phần. Hãy từ chối hoặc chờ khách lẻ huỷ.`,
        );
      }

      await this.prisma.$transaction([
        this.prisma.$executeRaw(Prisma.sql`
          UPDATE food_listings
          SET
            quantity_remaining = quantity_remaining - ${run.quantity},
            status = CASE WHEN quantity_remaining - ${run.quantity} <= 0 THEN 'fully_reserved'::listing_status ELSE status END,
            updated_at = NOW()
          WHERE id = ${run.listingId}::uuid
        `),
        this.prisma.bulkRun.update({
          where: { id: runId },
          data: { status: 'approved', approvedAt: new Date() },
        }),
      ]);
    } finally {
      await lock.release();
    }

    void this.notifications.notify(run.shipper.userId, {
      type: 'bulk_run',
      title: 'Yêu cầu giao sỉ được duyệt',
      body: `"${run.listing.title}" — ${run.quantity} phần đã sẵn sàng. Đến điểm lấy hàng và chụp ảnh bàn giao để bắt đầu.`,
      data: { bulkRunId: runId, status: 'approved' },
    });

    return { id: runId, status: 'approved' };
  }

  async reject(runId: string, providerUserId: string, reason?: string) {
    const provider = await this.resolveProvider(providerUserId);
    const run = await this.prisma.bulkRun.findUnique({
      where: { id: runId },
      include: { listing: { select: { title: true } }, shipper: { select: { userId: true } } },
    });
    if (!run) throw new NotFoundException('Không tìm thấy yêu cầu giao sỉ.');
    if (run.providerId !== provider.id) throw new ForbiddenException();
    if (run.status !== 'requested') {
      throw new BadRequestException('Yêu cầu này đã được xử lý hoặc không còn hiệu lực.');
    }

    await this.prisma.bulkRun.update({
      where: { id: runId },
      data: { status: 'rejected', rejectReason: reason?.trim() || null },
    });

    void this.notifications.notify(run.shipper.userId, {
      type: 'bulk_run',
      title: 'Yêu cầu giao sỉ bị từ chối',
      body: `"${run.listing.title}": ${reason?.trim() || 'Nhà cung cấp không thể đáp ứng lúc này.'}`,
      data: { bulkRunId: runId, status: 'rejected' },
    });

    return { id: runId, status: 'rejected' };
  }

  // ── Shipper: lấy hàng / điểm phát / hoàn tất / huỷ ──────────────────────────
  async pickup(runId: string, shipperUserId: string, qcPhotoUrl?: string) {
    const run = await this.ownedRun(runId, shipperUserId);
    if (run.status !== 'approved') {
      throw new BadRequestException('Chuyến chưa được duyệt hoặc đã lấy hàng rồi.');
    }

    // QR có hiệu lực 24 giờ cho bulk run (dài hơn bình thường 30 phút vì có nhiều điểm phát)
    const qrValidityMinutes = 24 * 60;
    const qrExpiresAt = new Date(Date.now() + qrValidityMinutes * 60 * 1000);

    // Lấy danh sách stops tại thời điểm lấy hàng
    const stops = await this.prisma.bulkRunStop.findMany({
      where: { runId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, label: true, plannedQty: true },
    });

    // Đảm bảo placeholder receiver tồn tại (lazy init)
    const receiverId = await this.getBulkPlaceholderReceiverId();

    // 1 reservation mỗi stop — QR code để shipper quét tại mỗi điểm phát
    const reservationOps: Prisma.PrismaPromise<unknown>[] = stops.map((stop) => {
      const token = this.makeQrToken(runId, stop.id);
      const qty = stop.plannedQty ?? 1;
      return this.prisma.reservation.create({
        data: {
          listingId: run.listingId,
          receiverId,
          bulkRunStopId: stop.id,
          quantity: qty,
          status: 'confirmed',
          qrToken: token,
          qrExpiresAt,
          receiverNotes: `Bulk Run: ${stop.label}`,
        },
      });
    });

    await this.prisma.$transaction([
      this.prisma.bulkRun.update({
        where: { id: runId },
        data: { status: 'picked_up', pickedUpAt: new Date(), ...(qcPhotoUrl ? { qcPhotoUrl } : {}) },
      }),
      ...reservationOps,
    ]);

    // Thông báo cho shipper
    void this.notifications.notify(shipperUserId, {
      type: 'bulk_run',
      title: 'Đã lấy hàng & tạo mã QR',
      body:
        stops.length > 0
          ? `${stops.length} mã QR đã được tạo cho ${stops.length} điểm phát. Mỗi mã QR tương ứng 1 điểm.`
          : 'Đã lấy hàng. Thêm điểm phát để nhận mã QR.',
      data: { bulkRunId: runId, status: 'picked_up', stopCount: stops.length },
    });

    return { id: runId, status: 'picked_up', stopCount: stops.length };
  }

  /** NCC (chủ tin) hoặc shipper của chuyến đều ghim được điểm phát.
   *  Nếu chuyến đã lấy hàng (picked_up) → tạo reservation + QR luôn. */
  async addStop(runId: string, userId: string, dto: AddStopDto) {
    const run = await this.prisma.bulkRun.findUnique({
      where: { id: runId },
      include: {
        shipper: { select: { userId: true } },
        provider: { select: { userId: true } },
        _count: { select: { stops: true } },
      },
    });
    if (!run) throw new NotFoundException('Không tìm thấy chuyến giao sỉ.');

    const createdBy =
      run.shipper.userId === userId ? 'shipper' : run.provider.userId === userId ? 'provider' : null;
    if (!createdBy) throw new ForbiddenException('Chỉ nhà cung cấp hoặc shipper của chuyến này mới thêm được điểm phát.');
    if (!(['requested', 'approved', 'picked_up'] as string[]).includes(run.status)) {
      throw new BadRequestException('Chuyến đã kết thúc — không thêm được điểm phát.');
    }
    // Hàng đã rời cửa hàng → tuyến thuộc quyền shipper, NCC không ghim thêm được nữa.
    if (run.status === 'picked_up' && createdBy === 'provider') {
      throw new ForbiddenException(
        'Tình nguyện viên đã lấy hàng và đang trên tuyến — chỉ họ mới thêm được điểm phát.',
      );
    }
    if (dto.plannedQty != null) {
      await this.assertPlannedWithinQuota(runId, run.quantity, dto.plannedQty);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];

    // Tạo reservation nếu chuyến đã lấy hàng
    let reservationId: string | undefined;
    if (run.status === 'picked_up') {
      const receiverId = await this.getBulkPlaceholderReceiverId();
      const qrToken = this.makeQrToken(runId, 'pending');
      const qrExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const qty = dto.plannedQty ?? 1;

      // Tạo reservation trước để có stopId gắn vào
      const stop = await this.prisma.bulkRunStop.create({
        data: {
          runId,
          label: dto.label.trim(),
          address: dto.address?.trim() || null,
          plannedQty: dto.plannedQty ?? null,
          createdBy,
          orderIndex: run._count.stops,
        },
      });
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE bulk_run_stops
        SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography
        WHERE id = ${stop.id}::uuid
      `);

      const realToken = this.makeQrToken(runId, stop.id);
      const reservation = await this.prisma.reservation.create({
        data: {
          listingId: run.listingId,
          receiverId,
          bulkRunStopId: stop.id,
          quantity: qty,
          status: 'confirmed',
          qrToken: realToken,
          qrExpiresAt,
          receiverNotes: `Bulk Run: ${dto.label.trim()}`,
        },
      });

      return {
        ...stop,
        coords: { lng: dto.lng, lat: dto.lat },
        reservationId: reservation.id,
        qrToken: realToken,
        qrExpiresAt,
      };
    }

    // Chưa lấy hàng: chỉ tạo stop bình thường
    const stop = await this.prisma.bulkRunStop.create({
      data: {
        runId,
        label: dto.label.trim(),
        address: dto.address?.trim() || null,
        plannedQty: dto.plannedQty ?? null,
        createdBy,
        orderIndex: run._count.stops,
      },
    });
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE bulk_run_stops
      SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography
      WHERE id = ${stop.id}::uuid
    `);

    return { ...stop, coords: { lng: dto.lng, lat: dto.lat }, reservationId: undefined };
  }

  /**
   * Quyền thao tác lên điểm phát: chỉ NCC chủ tin hoặc shipper của chuyến.
   * Trả về stop kèm cờ đã phát để nơi gọi tự quyết định chặn hay không.
   */
  private async stopForEdit(runId: string, stopId: string, userId: string) {
    const run = await this.prisma.bulkRun.findUnique({
      where: { id: runId },
      include: {
        shipper: { select: { userId: true } },
        provider: { select: { userId: true } },
      },
    });
    if (!run) throw new NotFoundException('Không tìm thấy chuyến giao sỉ.');
    const isShipper = run.shipper.userId === userId;
    const isProvider = run.provider.userId === userId;
    if (!isShipper && !isProvider) {
      throw new ForbiddenException('Chỉ nhà cung cấp hoặc shipper của chuyến này mới sửa được điểm phát.');
    }
    if (!(['requested', 'approved', 'picked_up'] as string[]).includes(run.status)) {
      throw new BadRequestException('Chuyến đã kết thúc — không sửa được điểm phát.');
    }
    // Hàng đã rời cửa hàng → tuyến đường thuộc quyền shipper. NCC đổi điểm lúc này
    // sẽ khiến shipper đang chạy ngoài đường bị đổi đích giữa chừng.
    if (run.status === 'picked_up' && isProvider) {
      throw new ForbiddenException(
        'Tình nguyện viên đã lấy hàng và đang trên tuyến — chỉ họ mới điều chỉnh được điểm phát.',
      );
    }

    // Reservation gắn với stop qua `reservations.bulk_run_stop_id`, không phải cột
    // `bulk_run_stops.reservation_id` (di sản, luôn NULL).
    const [stop] = await this.prisma.$queryRaw<
      { id: string; served_qty: number; reservation_id: string | null }[]
    >(Prisma.sql`
      SELECT s.id, s.served_qty, r.id AS reservation_id
      FROM bulk_run_stops s
      LEFT JOIN reservations r ON r.bulk_run_stop_id = s.id
      WHERE s.id = ${stopId}::uuid AND s.run_id = ${runId}::uuid
    `);
    if (!stop) throw new NotFoundException('Không tìm thấy điểm phát trong chuyến này.');
    // Đã phát rồi thì số liệu đã đi vào thống kê — sửa/xoá sẽ làm sai sổ sách
    if (stop.served_qty > 0) {
      throw new BadRequestException('Điểm này đã phát hàng — không sửa hoặc xoá được nữa.');
    }
    return { stop, run };
  }

  /**
   * Tổng số phần DỰ KIẾN của các điểm không được vượt số phần cả chuyến — nếu không
   * shipper sẽ lên kế hoạch phát nhiều hơn số hàng thực có và thiếu ở điểm cuối.
   * `excludeStopId` dùng khi đang sửa chính điểm đó (không tính hai lần).
   */
  private async assertPlannedWithinQuota(
    runId: string,
    runQuantity: number,
    plannedQty: number,
    excludeStopId?: string,
  ) {
    const agg = await this.prisma.bulkRunStop.aggregate({
      where: { runId, ...(excludeStopId ? { id: { not: excludeStopId } } : {}) },
      _sum: { plannedQty: true },
    });
    const used = Number(agg._sum.plannedQty ?? 0);
    if (used + plannedQty > runQuantity) {
      throw new BadRequestException(
        `Chuyến chỉ có ${runQuantity} phần, các điểm khác đã dự kiến ${used} phần — điểm này tối đa ${Math.max(0, runQuantity - used)} phần.`,
      );
    }
  }

  /** Sửa điểm phát (nhãn / địa chỉ / toạ độ / số phần dự kiến). */
  async updateStop(runId: string, stopId: string, userId: string, dto: UpdateStopDto) {
    const { run } = await this.stopForEdit(runId, stopId, userId);

    if ((dto.lng == null) !== (dto.lat == null)) {
      throw new BadRequestException('Đổi vị trí phải gửi đủ cả lng và lat.');
    }
    if (dto.plannedQty != null) {
      await this.assertPlannedWithinQuota(runId, run.quantity, dto.plannedQty, stopId);
    }

    await this.prisma.bulkRunStop.update({
      where: { id: stopId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.plannedQty !== undefined ? { plannedQty: dto.plannedQty } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
    });

    if (dto.lng != null && dto.lat != null) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE bulk_run_stops
        SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography
        WHERE id = ${stopId}::uuid
      `);
    }

    return { id: stopId, message: 'Đã cập nhật điểm phát.' };
  }

  /** Xoá điểm phát chưa phát hàng. */
  async removeStop(runId: string, stopId: string, userId: string) {
    const { stop } = await this.stopForEdit(runId, stopId, userId);

    // Điểm ghim sau khi lấy hàng có kèm một reservation ghi sổ — huỷ theo để không
    // để lại đơn mồ côi. Không hoàn kho ở đây: kho đã trừ theo cả chuyến lúc duyệt
    // và phần dư được trả lại khi kết thúc chuyến.
    await this.prisma.$transaction([
      ...(stop.reservation_id
        ? [this.prisma.reservation.update({
            where: { id: stop.reservation_id },
            data: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancellationReason: 'Điểm phát đã bị gỡ khỏi chuyến giao sỉ.',
            },
          })]
        : []),
      this.prisma.bulkRunStop.delete({ where: { id: stopId } }),
    ]);

    return { id: stopId, message: 'Đã gỡ điểm phát khỏi chuyến.' };
  }

  /** Ghi nhận đã phát N phần tại một điểm; phát đủ thì tự hoàn tất chuyến.
   *  Đồng thời chuyển reservation tương ứng → picked_up. */
  async serve(runId: string, shipperUserId: string, stopId: string, dto: ServeStopDto, photoUrl?: string) {
    const run = await this.ownedRun(runId, shipperUserId);
    if (run.status !== 'picked_up') {
      throw new BadRequestException('Chỉ ghi nhận phát hàng sau khi đã lấy hàng.');
    }
    // Quan hệ stop ↔ reservation nằm ở `reservations.bulk_run_stop_id` (phía Reservation
    // giữ khoá ngoại). Cột `bulk_run_stops.reservation_id` là di sản, KHÔNG nơi nào ghi —
    // đọc nó luôn ra NULL và chặn nhầm mọi điểm phát hợp lệ.
    const [stop] = await this.prisma.$queryRaw<{ id: string; reservation_id: string | null }[]>(
      Prisma.sql`
        SELECT s.id, r.id AS reservation_id
        FROM bulk_run_stops s
        LEFT JOIN reservations r ON r.bulk_run_stop_id = s.id
        WHERE s.id = ${stopId}::uuid AND s.run_id = ${runId}::uuid
      `,
    );
    if (!stop) throw new NotFoundException('Không tìm thấy điểm phát trong chuyến này.');
    if (!stop.reservation_id) {
      throw new BadRequestException('Điểm phát này chưa có mã QR — hãy thêm điểm phát sau khi lấy hàng.');
    }

    // Cộng dồn CÓ ĐIỀU KIỆN trong 1 câu SQL (atomic) — chặn race khi bấm nhanh
    // 2 lần / 2 thiết bị làm tổng phát vượt quá số phần đã nhận.
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE bulk_runs
      SET quantity_distributed = quantity_distributed + ${dto.servedQty}, updated_at = NOW()
      WHERE id = ${runId}::uuid
        AND status = 'picked_up'
        AND quantity_distributed + ${dto.servedQty} <= quantity
    `);
    if (updated === 0) {
      const fresh = await this.prisma.bulkRun.findUnique({
        where: { id: runId },
        select: { quantity: true, quantityDistributed: true },
      });
      const remaining = fresh ? fresh.quantity - fresh.quantityDistributed : 0;
      throw new BadRequestException(`Chỉ còn ${remaining} phần chưa phát — không thể ghi ${dto.servedQty} phần.`);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.bulkRunStop.update({
        where: { id: stopId },
        data: {
          servedQty: { increment: dto.servedQty },
          servedAt: new Date(),
          ...(dto.note ? { note: dto.note.trim() } : {}),
          ...(photoUrl ? { photoUrl } : {}),
        },
      }),
      // Chuyển reservation → picked_up để đánh dấu đã giao tại điểm này
      this.prisma.reservation.update({
        where: { id: stop.reservation_id },
        data: { status: 'picked_up' },
      }),
    ];

    await this.prisma.$transaction(ops);

    // Phát đủ số phần → hoàn tất luôn, khỏi bắt shipper bấm thêm
    const after = run.quantityDistributed + dto.servedQty;
    if (after >= run.quantity) {
      return this.finalize(runId);
    }
    return { id: runId, status: 'picked_up', quantityDistributed: after };
  }

  /** Kết thúc chuyến: phần dư (chưa phát) hoàn về kho — coi như trả lại NCC. */
  async complete(runId: string, shipperUserId: string) {
    const run = await this.ownedRun(runId, shipperUserId);
    if (run.status !== 'picked_up') {
      throw new BadRequestException('Chỉ hoàn tất được chuyến đã lấy hàng.');
    }
    return this.finalize(runId);
  }

  private async finalize(runId: string) {
    // Idempotent: chỉ 1 lời gọi chuyển được picked_up → completed (chặn cộng điểm đôi
    // khi auto-complete từ serve() đụng nút "Hoàn tất" bấm tay cùng lúc).
    const claimed = await this.prisma.bulkRun.updateMany({
      where: { id: runId, status: 'picked_up' },
      data: { status: 'completed', completedAt: new Date() },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.bulkRun.findUnique({
        where: { id: runId },
        select: { status: true, quantityDistributed: true },
      });
      return { id: runId, status: current?.status ?? 'completed', quantityDistributed: current?.quantityDistributed ?? 0 };
    }

    const run = await this.prisma.bulkRun.findUnique({
      where: { id: runId },
      include: {
        listing: { select: { title: true } },
        shipper: { select: { id: true, userId: true, dedicationPoints: true } },
        provider: { select: { userId: true } },
        stops: {
          select: { id: true, servedQty: true, reservationId: true },
        },
      },
    });
    if (!run) throw new NotFoundException('Không tìm thấy chuyến giao sỉ.');

    const leftover = run.quantity - run.quantityDistributed;
    const stopsServed = run.stops.filter((s) => s.servedQty > 0).length;
    // Thưởng: +5 gốc + 2 điểm/điểm phát có hàng (khuyến khích rải nhiều điểm)
    const points = 5 + stopsServed * 2;

    // Hoàn tất mọi reservation còn lại (chưa picked_up → completed)
    const remainingReservations = run.stops
      .filter((s) => s.servedQty === 0 && s.reservationId)
      .map((s) => s.reservationId!);

    const reservationOps: Prisma.PrismaPromise<unknown>[] = remainingReservations.map((rid: string) =>
      this.prisma.reservation.update({
        where: { id: rid },
        data: { status: 'completed' },
      }),
    );

    await this.prisma.$transaction([
      ...(leftover > 0 ? [this.restockSql(run.listingId, leftover)] : []),
      this.prisma.volunteerProfile.update({
        where: { id: run.shipper.id },
        data: { dedicationPoints: { increment: points } },
      }),
      this.prisma.dedicationPointsHistory.create({
        data: {
          volunteerId: run.shipper.id,
          delta: points,
          reason: 'bulk_distribution_completed',
          referenceType: 'bulk_run',
          referenceId: runId,
          pointsBefore: run.shipper.dedicationPoints,
          pointsAfter: run.shipper.dedicationPoints + points,
        },
      }),
      ...reservationOps,
    ]);

    void this.notifications.notify(run.provider.userId, {
      type: 'bulk_run',
      title: 'Chuyến giao sỉ hoàn tất',
      body: `"${run.listing.title}": đã phát ${run.quantityDistributed}/${run.quantity} phần tại ${stopsServed} điểm.${leftover > 0 ? ` ${leftover} phần dư đã hoàn về tin.` : ''}`,
      data: { bulkRunId: runId, status: 'completed' },
    });

    return { id: runId, status: 'completed', quantityDistributed: run.quantityDistributed, leftover, pointsAwarded: points };
  }

  async cancel(runId: string, shipperUserId: string) {
    const run = await this.ownedRun(runId, shipperUserId);
    if (run.status === 'picked_up') {
      throw new BadRequestException('Đã lấy hàng — hãy hoàn tất chuyến, phần chưa phát sẽ được hoàn về tin.');
    }
    if (run.status !== 'requested' && run.status !== 'approved') {
      throw new BadRequestException('Chuyến này không còn huỷ được.');
    }

    const wasApproved = run.status === 'approved';

    await this.prisma.$transaction([
      this.prisma.bulkRun.update({ where: { id: runId }, data: { status: 'cancelled' } }),
      // Đã duyệt (kho đã trừ) thì hoàn lại toàn bộ
      ...(wasApproved ? [this.restockSql(run.listingId, run.quantity)] : []),
    ]);

    // Phạt uy tín CÓ PHÂN BIỆT MỨC ĐỘ:
    // - Còn 'requested': NCC chưa duyệt, chưa ai bị ảnh hưởng → không phạt.
    // - Đã 'approved': kho đã bị giữ, NCC đã từ chối khách khác để dành hàng, và
    //   suất ăn nằm chờ hết hạn → phạt như huỷ trễ.
    if (wasApproved) {
      void this.trust.applyDelta(
        shipperUserId,
        -BULK_CANCEL_PENALTY,
        'bulk_run_cancelled_after_approval',
        'bulk_run',
        runId,
      );
    }

    const full = await this.prisma.bulkRun.findUnique({
      where: { id: runId },
      include: { provider: { select: { userId: true } }, listing: { select: { title: true } } },
    });
    if (full) {
      void this.notifications.notify(full.provider.userId, {
        type: 'bulk_run',
        title: 'Chuyến giao sỉ đã bị huỷ',
        body: `Tình nguyện viên đã huỷ yêu cầu ${run.quantity} phần "${full.listing.title}".`,
        data: { bulkRunId: runId, status: 'cancelled' },
      });
    }

    return { id: runId, status: 'cancelled' };
  }

  private async ownedRun(runId: string, shipperUserId: string) {
    const shipper = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
      select: { id: true },
    });
    if (!shipper) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    const run = await this.prisma.bulkRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Không tìm thấy chuyến giao sỉ.');
    if (run.shipperId !== shipper.id) throw new ForbiddenException();
    return run;
  }

  // ── Truy vấn 2 phía ─────────────────────────────────────────────────────────
  async myRuns(shipperUserId: string) {
    const shipper = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
      select: { id: true },
    });
    if (!shipper) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const runs = await this.prisma.bulkRun.findMany({
      where: { shipperId: shipper.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        listing: { select: { title: true, pickupAddress: true, imageUrls: true, quantityUnit: true } },
        provider: { select: { businessName: true, contactPhone: true } },
        stops: {
          orderBy: { orderIndex: 'asc' },
          include: {
            reservation: {
              select: { id: true, qrToken: true, status: true, qrExpiresAt: true },
            },
          },
        },
      },
    });
    return this.hydrateRuns(runs);
  }

  async providerRuns(providerUserId: string) {
    const provider = await this.resolveProvider(providerUserId);
    const runs = await this.prisma.bulkRun.findMany({
      where: { providerId: provider.id },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 30,
      include: {
        listing: { select: { title: true, pickupAddress: true, quantityUnit: true } },
        shipper: {
          select: {
            id: true,
            rank: true,
            dedicationPoints: true,
            avgRating: true,
            user: { select: { fullName: true, phone: true, trustScore: true } },
          },
        },
        stops: {
          orderBy: { orderIndex: 'asc' },
          include: {
            reservation: {
              select: { id: true, qrToken: true, status: true, qrExpiresAt: true },
            },
          },
        },
      },
    });

    const hydrated = await this.hydrateRuns(runs);

    // Thành tích của từng shipper để NCC có căn cứ duyệt — đếm riêng vì `_count` của
    // Prisma không lọc theo trạng thái được.
    const shipperIds = [...new Set(runs.map((r) => r.shipperId))];
    const stats = new Map<string, { completedRuns: number; deliveredOrders: number; failedOrders: number }>();
    if (shipperIds.length > 0) {
      const perShipper = await Promise.all(
        shipperIds.map(async (id) => {
          const [completedRuns, deliveredOrders, failedOrders] = await Promise.all([
            this.prisma.bulkRun.count({ where: { shipperId: id, status: 'completed' } }),
            this.prisma.delivery.count({ where: { shipperId: id, status: 'delivered' } }),
            this.prisma.delivery.count({ where: { shipperId: id, status: 'failed' } }),
          ]);
          return { id, completedRuns, deliveredOrders, failedOrders };
        }),
      );
      for (const s of perShipper) {
        stats.set(s.id, {
          completedRuns: s.completedRuns,
          deliveredOrders: s.deliveredOrders,
          failedOrders: s.failedOrders,
        });
      }
    }

    return hydrated.map((r) => ({
      ...r,
      shipperStats: stats.get(r.shipperId) ?? null,
    }));
  }

  // ── Cron: dọn yêu cầu/chuyến bị bỏ quên ────────────────────────────────────
  async expireStalled(): Promise<number> {
    let n = 0;
    const now = Date.now();

    // 1. Chờ duyệt quá hạn → huỷ (chưa trừ kho nên không cần hoàn)
    const staleRequests = await this.prisma.bulkRun.updateMany({
      where: {
        status: 'requested',
        createdAt: { lt: new Date(now - REQUEST_EXPIRY_HOURS * 3600 * 1000) },
      },
      data: {
        status: 'cancelled',
        rejectReason: `Quá ${REQUEST_EXPIRY_HOURS} giờ không được nhà cung cấp duyệt.`,
      },
    });
    n += staleRequests.count;

    // 2. Đã duyệt nhưng không đến lấy → huỷ + trả lại TOÀN BỘ kho đang bị giữ.
    //    Tính từ approvedAt, không phải lần cập nhật cuối.
    const notPickedUp = await this.prisma.bulkRun.findMany({
      where: {
        status: 'approved',
        approvedAt: { lt: new Date(now - PICKUP_DEADLINE_HOURS * 3600 * 1000) },
      },
      select: { id: true, listingId: true, quantity: true },
      take: 50,
    });
    for (const r of notPickedUp) {
      await this.prisma.$transaction([
        this.prisma.bulkRun.update({
          where: { id: r.id },
          data: {
            status: 'cancelled',
            rejectReason: `Tự động huỷ: quá ${PICKUP_DEADLINE_HOURS} giờ không đến lấy hàng.`,
          },
        }),
        this.restockSql(r.listingId, r.quantity),
      ]);
      n += 1;
    }

    // 3. Đã lấy hàng nhưng chưa phát xong → đóng chuyến + hoàn phần còn dư.
    //    Tính từ pickedUpAt để có hạn cứng, tránh việc phát nhỏ giọt kéo dài vô hạn.
    const overdue = await this.prisma.bulkRun.findMany({
      where: {
        status: 'picked_up',
        pickedUpAt: { lt: new Date(now - RUN_COMPLETION_HOURS * 3600 * 1000) },
      },
      select: { id: true, listingId: true, quantity: true, quantityDistributed: true },
      take: 50,
    });
    for (const r of overdue) {
      const leftover = r.quantity - r.quantityDistributed;
      await this.prisma.$transaction([
        this.prisma.bulkRun.update({
          where: { id: r.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            rejectReason: `Tự động đóng: quá ${RUN_COMPLETION_HOURS} giờ chưa phát xong.`,
          },
        }),
        ...(leftover > 0 ? [this.restockSql(r.listingId, leftover)] : []),
      ]);
      n += 1;
    }

    return n;
  }
}
