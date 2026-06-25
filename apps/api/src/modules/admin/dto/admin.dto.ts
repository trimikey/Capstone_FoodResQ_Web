import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AssignmentRole, ReportStatus, FoodCategory } from '@foodresq/types';

export class SetConfigDto {
  @ApiProperty({ example: 5, description: 'Giá trị số mới cho khoá cấu hình' })
  @IsNumber()
  value!: number;
}

export class UpdateListingCategoryDto {
  @ApiProperty({ enum: FoodCategory, description: 'Loại thực phẩm mới' })
  @IsEnum(FoodCategory)
  category!: FoodCategory;
}

export class ReviewCampaignChangeDto {
  @ApiProperty({ enum: ['approve', 'reject'], description: 'Duyệt hay từ chối yêu cầu thay đổi' })
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Ghi chú của admin (lý do từ chối...)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class SetCampaignStatusDto {
  @ApiProperty({ enum: ['draft', 'open', 'in_progress', 'completed', 'cancelled'] })
  @IsIn(['draft', 'open', 'in_progress', 'completed', 'cancelled'])
  status!: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
}

export class AdminCreateCampaignDto {
  @ApiProperty() @IsUUID() charityReceiverId!: string;

  @ApiProperty() @IsString() @MinLength(5) @MaxLength(255) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiProperty() @IsString() @MinLength(5) kitchenAddress!: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180) @Type(() => Number) lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-90) @Max(90) @Type(() => Number) lat?: number;

  @ApiProperty({ example: '2026-06-25' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) scheduledDate!: string;
  @ApiProperty({ example: '08:00' }) @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @ApiProperty({ example: '12:00' }) @Matches(/^\d{2}:\d{2}$/) endTime!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) @Type(() => Number) chefSlotsNeeded?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) @Type(() => Number) waiterSlotsNeeded?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) @Type(() => Number) shipperSlotsNeeded?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) expectedServings?: number;
}

export class AdminUpdateCampaignDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(5) @MaxLength(255) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(5) kitchenAddress?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) scheduledDate?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{2}:\d{2}$/) startTime?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{2}:\d{2}$/) endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) @Type(() => Number) chefSlotsNeeded?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) @Type(() => Number) waiterSlotsNeeded?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) @Type(() => Number) shipperSlotsNeeded?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) expectedServings?: number;
}

export class AdminCreateUserDto {
  @ApiProperty() @IsString() @MaxLength(255) email!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) fullName!: string;

  @ApiProperty({ enum: ['receiver', 'provider', 'volunteer'] })
  @IsIn(['receiver', 'provider', 'volunteer'])
  role!: 'receiver' | 'provider' | 'volunteer';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() businessName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;

  @ApiPropertyOptional({ enum: ['chef', 'waiter', 'shipper'] })
  @IsOptional() @IsIn(['chef', 'waiter', 'shipper'])
  volunteerRole?: 'chef' | 'waiter' | 'shipper';
}

export class AssignVolunteerDto {
  @ApiProperty() @IsUUID() volunteerId!: string;

  @ApiProperty({ enum: AssignmentRole })
  @IsEnum(AssignmentRole)
  role!: AssignmentRole;

  @ApiPropertyOptional({ description: 'Gán vượt chuyên môn (bỏ kiểm tra specialization)' })
  @IsOptional()
  @IsBoolean()
  override?: boolean;
}

export class ReviewVerificationDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolveReportDto {
  @ApiProperty({ enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED] })
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended', 'banned'] })
  @IsIn(['active', 'suspended', 'banned'])
  status!: 'active' | 'suspended' | 'banned';
}
