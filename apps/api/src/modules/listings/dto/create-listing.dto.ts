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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FoodCategory, QuantityUnit } from '@foodresq/types';

export class CreateListingDto {
  @ApiProperty({ example: 'Cơm hộp thừa cuối ngày' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: FoodCategory })
  @IsEnum(FoodCategory)
  category!: FoodCategory;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantityTotal!: number;

  @ApiProperty({ enum: QuantityUnit, default: QuantityUnit.PORTION })
  @IsEnum(QuantityUnit)
  quantityUnit!: QuantityUnit;

  @ApiPropertyOptional({ example: 0.5, description: 'kg per unit — dùng để tính ESG' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  weightPerUnitKg?: number;

  @ApiProperty({ example: '2026-06-08T08:00:00Z' })
  @IsDateString()
  pickupStartTime!: string;

  @ApiProperty({ example: '2026-06-08T12:00:00Z' })
  @IsDateString()
  pickupEndTime!: string;

  @ApiProperty({ example: '2026-06-08T14:00:00Z' })
  @IsDateString()
  expiryTime!: string;

  @ApiProperty({ example: '12 Nguyễn Huệ, Q1, TP.HCM' })
  @IsString()
  @IsNotEmpty()
  pickupAddress!: string;

  @ApiProperty({ example: 106.6297 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng!: number;

  @ApiProperty({ example: 10.8231 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat!: number;

  @ApiPropertyOptional({ example: 'Bảo quản lạnh dưới 4°C' })
  @IsOptional()
  @IsString()
  storageConditions?: string;

  @ApiPropertyOptional({ example: 'Không có gluten' })
  @IsOptional()
  @IsString()
  allergenNotes?: string;

  @ApiProperty({ example: 1, description: 'Số phần tối đa / 1 đặt chỗ' })
  @IsNumber()
  @IsPositive()
  @Max(10)
  @Type(() => Number)
  maxPerReservation!: number;

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
