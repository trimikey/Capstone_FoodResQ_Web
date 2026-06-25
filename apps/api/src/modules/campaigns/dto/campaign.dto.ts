import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AssignmentRole } from '@foodresq/types';

export class MenuItemDto {
  @ApiProperty({ example: 'Cơm thịt kho tàu' }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ example: 'Món chính' }) @IsString() @MaxLength(60) type!: string;
}

export class ScheduleItemDto {
  @ApiProperty({ example: '06:00 - 08:00' }) @IsString() @MaxLength(40) time!: string;
  @ApiProperty({ example: 'Chuẩn bị nguyên liệu & Sơ chế' }) @IsString() @MinLength(1) @MaxLength(160) label!: string;
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'Bếp ăn 0 đồng cuối tuần' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '210 Lê Quang Định, Bình Thạnh' })
  @IsString()
  @MinLength(5)
  kitchenAddress!: string;

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

  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ example: '08:00' })
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  chefSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  waiterSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  shipperSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  expectedServings?: number;

  @ApiPropertyOptional({ example: ['/uploads/campaigns/abc.jpg'], description: 'Ảnh chiến dịch (URL trả về từ /campaigns/upload-image)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: [MenuItemDto], description: 'Thực đơn trong ngày' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menuItems?: MenuItemDto[];

  @ApiPropertyOptional({ type: [ScheduleItemDto], description: 'Lịch trình hoạt động' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  scheduleItems?: ScheduleItemDto[];

  @ApiPropertyOptional({ example: ['Gạo sạch', 'Dầu ăn'], description: 'Vật phẩm cần thiết' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  supplyItems?: string[];
}

export class ApplyCampaignDto {
  @ApiProperty({ enum: AssignmentRole })
  @IsEnum(AssignmentRole)
  role!: AssignmentRole;
}

export class CompleteCampaignDto {
  @ApiProperty({ example: 150, description: 'Số suất ăn thực tế đã phục vụ' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  actualServings!: number;
}

export class PledgeDonationDto {
  @ApiProperty({ example: 'Gạo' }) @IsString() @MinLength(1) @MaxLength(255) itemName!: string;
  @ApiPropertyOptional({ example: '20 kg' }) @IsOptional() @IsString() @MaxLength(100) quantity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Tổ chức gửi YÊU CẦU thay đổi chiến dịch (chờ admin duyệt).
 * Mọi trường đều optional — chỉ gửi trường muốn đổi (bỏ trống = giữ nguyên).
 * lng & lat phải đi cùng nhau; phải có ít nhất một trường thay đổi (kiểm tra ở service).
 */
export class SubmitCampaignChangeDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @ApiPropertyOptional({ example: '210 Lê Quang Định, Bình Thạnh' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  kitchenAddress?: string;

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

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  chefSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  waiterSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  shipperSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 'Đổi giờ vì bếp bận buổi sáng', description: 'Lý do thay đổi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
