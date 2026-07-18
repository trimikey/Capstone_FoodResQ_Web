import {
  IsBoolean,
  IsString,
  IsEnum,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  IsArray,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FoodCategory, QuantityUnit } from '@foodresq/types';

/**
 * Sửa tin thực phẩm.
 * - Draft: tất cả field optional, NCC sửa tự do.
 * - Active/fully_reserved: CHỈ whitelist `description, imageUrls, storageConditions,
 *   allergenNotes` — service sẽ chặn các field khác (tránh đổi địa điểm/số lượng
 *   khi người nhận đã đặt).
 */
export class UpdateListingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: FoodCategory })
  @IsOptional()
  @IsEnum(FoodCategory)
  category?: FoodCategory;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantityTotal?: number;

  @ApiPropertyOptional({ enum: QuantityUnit })
  @IsOptional()
  @IsEnum(QuantityUnit)
  quantityUnit?: QuantityUnit;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  weightPerUnitKg?: number;

  @ApiPropertyOptional({ example: '2026-06-08T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  pickupStartTime?: string;

  @ApiPropertyOptional({ example: '2026-06-08T12:00:00Z' })
  @IsOptional()
  @IsDateString()
  pickupEndTime?: string;

  @ApiPropertyOptional({ example: '2026-06-08T14:00:00Z' })
  @IsOptional()
  @IsDateString()
  expiryTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pickupAddress?: string;

  @ApiPropertyOptional({ example: 106.6297 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 10.8231 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageConditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergenNotes?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10)
  @Type(() => Number)
  maxPerReservation?: number;

  @ApiPropertyOptional({ example: ['https://...'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ example: false, description: 'Túi bất ngờ (kiểu Too Good To Go)' })
  @IsOptional()
  @IsBoolean()
  isSurpriseBag?: boolean;
}
