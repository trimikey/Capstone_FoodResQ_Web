import {
  IsBoolean,
  IsString,
  IsEnum,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  IsInt,
  IsArray,
  ArrayNotEmpty,
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

  // Khung giờ mở cửa TRONG NGÀY, phút từ 00:00 giờ VN. Cặp đi cùng nhau: gửi cả hai
  // hoặc không gửi cái nào (tin không giới hạn giờ trong ngày).
  @ApiPropertyOptional({ example: 420, description: 'Giờ mở nhận trong ngày (phút từ 00:00, 7:00 → 420)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  @Type(() => Number)
  dailyStartMinute?: number;

  @ApiPropertyOptional({ example: 1260, description: 'Giờ đóng nhận trong ngày (phút từ 00:00, 21:00 → 1260)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  @Type(() => Number)
  dailyEndMinute?: number;

  // BẮT BUỘC ít nhất 1 ảnh: người nhận không có cách nào đánh giá thực phẩm trước khi
  // tới lấy, và tin không ảnh gần như không có lượt đặt.
  @ApiProperty({ example: ['https://...'], description: 'Ít nhất 1 ảnh thực phẩm' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Tin đăng phải có ít nhất 1 ảnh thực phẩm.' })
  @IsString({ each: true })
  imageUrls!: string[];

  @ApiPropertyOptional({ example: false, description: 'Túi bất ngờ (kiểu Too Good To Go)' })
  @IsOptional()
  @IsBoolean()
  isSurpriseBag?: boolean;
}
