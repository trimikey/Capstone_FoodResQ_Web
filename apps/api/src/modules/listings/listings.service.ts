import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { QueryListingDto } from './dto/query-listing.dto';

const DEFAULT_RADIUS_KM = 5;
const DEFAULT_LIMIT = 20;

/** Field được phép sửa khi tin đã đăng (active/fully_reserved) — tránh đổi địa điểm/giờ/số lượng khi người nhận đã đặt. */
const EDITABLE_WHEN_ACTIVE = new Set<keyof UpdateListingDto>([
  'description',
  'imageUrls',
  'storageConditions',
  'allergenNotes',
]);

export interface NearbyRow {
  id: string;
  title: string;
  category: string;
  quantity_remaining: string;
  quantity_unit: string;
  weight_per_unit_kg: string | null;
  pickup_start_time: Date;
  pickup_end_time: Date;
  pickup_address: string;
  storage_conditions: string | null;
  allergen_notes: string | null;
  max_per_reservation: number;
  image_urls: unknown;
  status: string;
  provider_id: string;
  business_name: string;
  distance_m: number;
  lng: number;
  lat: number;
}

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Đổi userId (từ JWT) sang provider_profiles.id — đồng thời chặn nếu hồ sơ NCC
   * chưa được admin duyệt (tránh tạo/publish tin trước khi verify).
   */
  private async resolveProviderId(userId: string): Promise<string> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true, businessName: true },
    });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ cửa hàng.');
    if (profile.verificationStatus !== 'approved') {
      throw new ForbiddenException(
        `Hồ sơ cửa hàng "${profile.businessName}" chưa được quản trị viên duyệt (trạng thái: ${profile.verificationStatus}). Không thể đăng tin cho đến khi được duyệt.`,
      );
    }
    return profile.id;
  }

  async create(userId: string, dto: CreateListingDto) {
    const providerId = await this.resolveProviderId(userId);

    if (new Date(dto.pickupEndTime) <= new Date(dto.pickupStartTime)) {
      throw new BadRequestException('Giờ kết thúc nhận phải sau giờ bắt đầu nhận.');
    }
    if (new Date(dto.expiryTime) < new Date(dto.pickupEndTime)) {
      throw new BadRequestException('Hạn sử dụng phải sau hoặc bằng giờ kết thúc nhận.');
    }

    // Insert via raw SQL to handle the GEOGRAPHY column
    const result = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO food_listings (
        provider_id, title, description, category,
        quantity_total, quantity_remaining, quantity_unit, weight_per_unit_kg,
        pickup_start_time, pickup_end_time, expiry_time,
        pickup_address, pickup_location,
        storage_conditions, allergen_notes, max_per_reservation, image_urls,
        status, created_at, updated_at
      ) VALUES (
        ${providerId}::uuid, ${dto.title}, ${dto.description ?? null}, ${dto.category}::food_category,
        ${dto.quantityTotal}, ${dto.quantityTotal}, ${dto.quantityUnit}::quantity_unit,
        ${dto.weightPerUnitKg ?? null},
        ${dto.pickupStartTime}::timestamptz, ${dto.pickupEndTime}::timestamptz,
        ${dto.expiryTime}::timestamptz,
        ${dto.pickupAddress}, ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
        ${dto.storageConditions ?? null}, ${dto.allergenNotes ?? null},
        ${dto.maxPerReservation}, ${JSON.stringify(dto.imageUrls ?? [])}::jsonb,
        'draft'::listing_status, NOW(), NOW()
      )
      RETURNING id
    `);

    const id = result[0]?.id;
    if (!id) throw new BadRequestException('Tạo tin thất bại. Vui lòng thử lại.');

    return this.findOne(id);
  }

  async findNearby(query: QueryListingDto) {
    const lat = query.lat;
    const lng = query.lng;
    const radiusM = (query.radiusKm ?? DEFAULT_RADIUS_KM) * 1000;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = ((query.page ?? 1) - 1) * limit;

    // Base query — always filter active + not deleted + not expired
    let rows: NearbyRow[];

    if (lat !== undefined && lng !== undefined) {
      // Spatial search
      rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
        SELECT
          fl.id, fl.title, fl.category, fl.quantity_remaining, fl.quantity_unit,
          fl.weight_per_unit_kg, fl.pickup_start_time, fl.pickup_end_time,
          fl.pickup_address, fl.storage_conditions, fl.allergen_notes,
          fl.max_per_reservation, fl.image_urls, fl.status,
          fl.provider_id, pp.business_name,
          ST_X(fl.pickup_location::geometry) AS lng,
          ST_Y(fl.pickup_location::geometry) AS lat,
          ST_Distance(
            fl.pickup_location::geography,
            ST_MakePoint(${lng}, ${lat})::geography
          ) AS distance_m
        FROM food_listings fl
        JOIN provider_profiles pp ON pp.id = fl.provider_id
        WHERE fl.status = 'active'
          AND fl.deleted_at IS NULL
          AND fl.pickup_end_time > NOW()
          AND fl.quantity_remaining > 0
          AND ST_DWithin(
            fl.pickup_location::geography,
            ST_MakePoint(${lng}, ${lat})::geography,
            ${radiusM}
          )
          ${query.category ? Prisma.sql`AND fl.category = ${query.category}::food_category` : Prisma.empty}
          ${query.search ? Prisma.sql`AND fl.title ILIKE ${'%' + query.search + '%'}` : Prisma.empty}
        ORDER BY distance_m ASC
        LIMIT ${limit} OFFSET ${offset}
      `);
    } else {
      // No location — return latest active listings
      rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
        SELECT
          fl.id, fl.title, fl.category, fl.quantity_remaining, fl.quantity_unit,
          fl.weight_per_unit_kg, fl.pickup_start_time, fl.pickup_end_time,
          fl.pickup_address, fl.storage_conditions, fl.allergen_notes,
          fl.max_per_reservation, fl.image_urls, fl.status,
          fl.provider_id, pp.business_name,
          ST_X(fl.pickup_location::geometry) AS lng,
          ST_Y(fl.pickup_location::geometry) AS lat,
          0::float AS distance_m
        FROM food_listings fl
        JOIN provider_profiles pp ON pp.id = fl.provider_id
        WHERE fl.status = 'active'
          AND fl.deleted_at IS NULL
          AND fl.pickup_end_time > NOW()
          AND fl.quantity_remaining > 0
          ${query.category ? Prisma.sql`AND fl.category = ${query.category}::food_category` : Prisma.empty}
          ${query.search ? Prisma.sql`AND fl.title ILIKE ${'%' + query.search + '%'}` : Prisma.empty}
        ORDER BY fl.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      quantityRemaining: Number(r.quantity_remaining),
      quantityUnit: r.quantity_unit,
      weightPerUnitKg: r.weight_per_unit_kg ? Number(r.weight_per_unit_kg) : null,
      pickupStartTime: r.pickup_start_time,
      pickupEndTime: r.pickup_end_time,
      pickupAddress: r.pickup_address,
      storageConditions: r.storage_conditions,
      allergenNotes: r.allergen_notes,
      maxPerReservation: r.max_per_reservation,
      imageUrls: r.image_urls,
      status: r.status,
      provider: { id: r.provider_id, businessName: r.business_name },
      distanceM: Math.round(r.distance_m),
      lng: Number(r.lng),
      lat: Number(r.lat),
    }));
  }

  async findOne(id: string) {
    const result = await this.prisma.$queryRaw<
      (NearbyRow & { description: string | null; lng: number; lat: number })[]
    >(Prisma.sql`
      SELECT
        fl.id, fl.title, fl.description, fl.category, fl.quantity_remaining, fl.quantity_unit,
        fl.weight_per_unit_kg, fl.pickup_start_time, fl.pickup_end_time, fl.pickup_address,
        fl.storage_conditions, fl.allergen_notes, fl.max_per_reservation, fl.image_urls, fl.status,
        fl.provider_id, pp.business_name,
        ST_X(fl.pickup_location::geometry) AS lng,
        ST_Y(fl.pickup_location::geometry) AS lat
      FROM food_listings fl
      JOIN provider_profiles pp ON pp.id = fl.provider_id
      WHERE fl.id = ${id}::uuid AND fl.deleted_at IS NULL
    `);

    const r = result[0];
    if (!r) throw new NotFoundException('Không tìm thấy tin thực phẩm.');

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      quantityRemaining: Number(r.quantity_remaining),
      quantityUnit: r.quantity_unit,
      weightPerUnitKg: r.weight_per_unit_kg ? Number(r.weight_per_unit_kg) : null,
      pickupStartTime: r.pickup_start_time,
      pickupEndTime: r.pickup_end_time,
      pickupAddress: r.pickup_address,
      storageConditions: r.storage_conditions,
      allergenNotes: r.allergen_notes,
      maxPerReservation: r.max_per_reservation,
      imageUrls: r.image_urls,
      status: r.status,
      provider: { id: r.provider_id, businessName: r.business_name },
      lng: Number(r.lng),
      lat: Number(r.lat),
    };
  }

  async publish(listingId: string, userId: string) {
    const providerId = await this.resolveProviderId(userId);
    const listing = await this.prisma.foodListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Không tìm thấy tin thực phẩm.');
    if (listing.providerId !== providerId) throw new ForbiddenException();
    if (listing.status !== 'draft') {
      throw new BadRequestException('Chỉ đăng được tin đang ở trạng thái nháp.');
    }

    return this.prisma.foodListing.update({
      where: { id: listingId },
      data: { status: 'active' },
    });
  }

  async cancel(listingId: string, userId: string, reason?: string) {
    const providerId = await this.resolveProviderId(userId);
    const listing = await this.prisma.foodListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Không tìm thấy tin thực phẩm.');
    if (listing.providerId !== providerId) throw new ForbiddenException();

    return this.prisma.foodListing.update({
      where: { id: listingId },
      data: { status: 'cancelled', cancelledReason: reason ?? null },
    });
  }

  async findByProvider(userId: string, page = 1, limit = 20) {
    const providerId = await this.resolveProviderId(userId);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.foodListing.findMany({
        where: { providerId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.foodListing.count({ where: { providerId, deletedAt: null } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Sửa tin:
   *  - draft → sửa mọi field (kể cả toạ độ — qua raw SQL).
   *  - active / fully_reserved → CHỈ whitelist field mềm (mô tả, ảnh, bảo quản, dị ứng).
   *    Field cứng bị chặn để không đổi địa điểm/giờ/số lượng khi người nhận đã đặt.
   *  - completed / expired / cancelled → không cho sửa.
   *
   * Lưu ý: nếu `quantityTotal` giảm xuống dưới `quantityRemaining` → throw 400.
   */
  async update(listingId: string, userId: string, dto: UpdateListingDto) {
    const providerId = await this.resolveProviderId(userId);
    const listing = await this.prisma.foodListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Không tìm thấy tin thực phẩm.');
    if (listing.providerId !== providerId) {
      throw new ForbiddenException('Bạn không sở hữu tin này.');
    }

    const editableStatuses = new Set(['draft', 'active', 'fully_reserved']);
    if (!editableStatuses.has(listing.status)) {
      throw new BadRequestException(
        `Tin đang ở trạng thái "${listing.status}" — không thể chỉnh sửa.`,
      );
    }

    const isDraft = listing.status === 'draft';

    // Kiểm tra whitelist khi edit active/fully_reserved
    if (!isDraft) {
      for (const key of Object.keys(dto) as (keyof UpdateListingDto)[]) {
        if (dto[key] === undefined) continue;
        if (!EDITABLE_WHEN_ACTIVE.has(key)) {
          throw new BadRequestException(
            `Không thể sửa "${key}" khi tin đã được đăng. Hãy huỷ rồi tạo lại nếu cần thay đổi lớn.`,
          );
        }
      }
    }

    // Validate thời gian nếu có thay đổi
    if (isDraft) {
      const newStart = dto.pickupStartTime ? new Date(dto.pickupStartTime) : listing.pickupStartTime;
      const newEnd = dto.pickupEndTime ? new Date(dto.pickupEndTime) : listing.pickupEndTime;
      const newExp = dto.expiryTime ? new Date(dto.expiryTime) : listing.expiryTime;
      if (newEnd <= newStart) {
        throw new BadRequestException('Giờ kết thúc nhận phải sau giờ bắt đầu nhận.');
      }
      if (newExp < newEnd) {
        throw new BadRequestException('Hạn sử dụng phải sau hoặc bằng giờ kết thúc nhận.');
      }
    }

    // Không cho quantityTotal < quantityRemaining (có người đã đặt)
    if (isDraft && dto.quantityTotal !== undefined && dto.quantityTotal < Number(listing.quantityRemaining)) {
      throw new BadRequestException(
        `Tổng số lượng mới (${dto.quantityTotal}) không được nhỏ hơn số đã có người đặt (${listing.quantityRemaining}).`,
      );
    }

    // Nếu đổi toạ độ trên draft → so sánh với vị trí hiện tại (đọc qua raw SQL vì pickup_location là Unsupported)
    let locationChanged = false;
    if (isDraft && dto.lng !== undefined && dto.lat !== undefined) {
      const [{ lng: curLng = null, lat: curLat = null } = {}] = await this.prisma.$queryRaw<
        { lng: number | null; lat: number | null }[]
      >(Prisma.sql`
        SELECT ST_X(pickup_location::geometry) AS lng,
               ST_Y(pickup_location::geometry) AS lat
        FROM food_listings WHERE id = ${listingId}::uuid
      `);
      locationChanged =
        curLng == null ||
        curLat == null ||
        Number(dto.lng) !== Number(curLng) ||
        Number(dto.lat) !== Number(curLat);
    }

    const data: Prisma.FoodListingUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.quantityTotal !== undefined) {
      data.quantityTotal = dto.quantityTotal;
      const diff = dto.quantityTotal - Number(listing.quantityTotal);
      if (diff > 0) {
        data.quantityRemaining = { increment: diff };
      }
    }
    if (dto.quantityUnit !== undefined) data.quantityUnit = dto.quantityUnit;
    if (dto.weightPerUnitKg !== undefined) data.weightPerUnitKg = dto.weightPerUnitKg ?? null;
    if (dto.pickupStartTime !== undefined) data.pickupStartTime = new Date(dto.pickupStartTime);
    if (dto.pickupEndTime !== undefined) data.pickupEndTime = new Date(dto.pickupEndTime);
    if (dto.expiryTime !== undefined) data.expiryTime = new Date(dto.expiryTime);
    if (dto.pickupAddress !== undefined) data.pickupAddress = dto.pickupAddress;
    if (dto.storageConditions !== undefined) data.storageConditions = dto.storageConditions ?? null;
    if (dto.allergenNotes !== undefined) data.allergenNotes = dto.allergenNotes ?? null;
    if (dto.maxPerReservation !== undefined) data.maxPerReservation = dto.maxPerReservation;
    if (dto.imageUrls !== undefined) data.imageUrls = dto.imageUrls as never;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.foodListing.update({ where: { id: listingId }, data });
      }
      if (locationChanged && dto.lng !== undefined && dto.lat !== undefined) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE food_listings
          SET pickup_location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
              updated_at = NOW()
          WHERE id = ${listingId}::uuid
        `);
      }
    });

    return this.findOne(listingId);
  }
}
