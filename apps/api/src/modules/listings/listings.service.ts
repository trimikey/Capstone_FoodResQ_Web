import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { QueryListingDto } from './dto/query-listing.dto';

const DEFAULT_RADIUS_KM = 5;
const DEFAULT_LIMIT = 20;

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
}

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  async create(providerId: string, dto: CreateListingDto) {
    if (new Date(dto.pickupEndTime) <= new Date(dto.pickupStartTime)) {
      throw new BadRequestException('pickup_end_time must be after pickup_start_time');
    }
    if (new Date(dto.expiryTime) < new Date(dto.pickupEndTime)) {
      throw new BadRequestException('expiry_time must be >= pickup_end_time');
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
    if (!id) throw new BadRequestException('Failed to create listing');

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
    }));
  }

  async findOne(id: string) {
    const result = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      SELECT
        fl.*, pp.business_name,
        ST_X(fl.pickup_location::geometry) AS lng,
        ST_Y(fl.pickup_location::geometry) AS lat
      FROM food_listings fl
      JOIN provider_profiles pp ON pp.id = fl.provider_id
      WHERE fl.id = ${id}::uuid AND fl.deleted_at IS NULL
    `);

    if (!result[0]) throw new NotFoundException('Listing not found');
    return result[0];
  }

  async publish(listingId: string, providerId: string) {
    const listing = await this.prisma.foodListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.providerId !== providerId) throw new ForbiddenException();
    if (listing.status !== 'draft') {
      throw new BadRequestException('Only draft listings can be published');
    }

    return this.prisma.foodListing.update({
      where: { id: listingId },
      data: { status: 'active' },
    });
  }

  async cancel(listingId: string, providerId: string, reason?: string) {
    const listing = await this.prisma.foodListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.providerId !== providerId) throw new ForbiddenException();

    return this.prisma.foodListing.update({
      where: { id: listingId },
      data: { status: 'cancelled', cancelledReason: reason ?? null },
    });
  }

  async findByProvider(providerId: string, page = 1, limit = 20) {
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
}
