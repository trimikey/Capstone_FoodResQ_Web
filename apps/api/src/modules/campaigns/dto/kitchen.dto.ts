import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AssignmentRole, SafetyCheckResult, SafetyCheckType } from '@foodresq/types';

// ── Ca làm việc ────────────────────────────────────────────────────────────────

export class CreateShiftDto {
  @ApiProperty({ example: 'Ca sáng - Sơ chế & nấu' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;

  @ApiPropertyOptional({ enum: AssignmentRole, description: 'Ca dành cho vai trò nào (bỏ trống = chung)' })
  @IsOptional()
  @IsEnum(AssignmentRole)
  role?: AssignmentRole;

  @ApiProperty({ example: '06:00' })
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({ example: '10:00' })
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  slotsNeeded!: number;
}

export class ApplyShiftDto {
  @ApiPropertyOptional({ enum: AssignmentRole, description: 'Bắt buộc nếu ca không gắn sẵn vai trò' })
  @IsOptional()
  @IsEnum(AssignmentRole)
  role?: AssignmentRole;
}

// ── Thực đơn (liên kết công thức) ──────────────────────────────────────────────

export class AddMenuItemDto {
  @ApiPropertyOptional({ description: 'ID công thức trong thư viện (bỏ trống nếu món tự do)' })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({ example: 'Canh rau củ', description: 'Tên món tự do nếu không dùng công thức' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customName?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  plannedServings?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

// ── Nhật ký an toàn thực phẩm (chef) ───────────────────────────────────────────

export class CreateSafetyLogDto {
  @ApiProperty({ enum: SafetyCheckType, example: SafetyCheckType.TEMPERATURE })
  @IsEnum(SafetyCheckType)
  checkType!: SafetyCheckType;

  @ApiPropertyOptional({ example: '75°C', description: 'Giá trị đo được' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  measuredValue?: string;

  @ApiPropertyOptional({ enum: SafetyCheckResult, example: SafetyCheckResult.PASS })
  @IsOptional()
  @IsEnum(SafetyCheckResult)
  result?: SafetyCheckResult;

  @ApiPropertyOptional({ example: 'Nhiệt độ trung tâm món kho đạt chuẩn.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ── Phân phát suất ăn (waiter) ─────────────────────────────────────────────────

export class CreateDistributionDto {
  @ApiPropertyOptional({ example: 'Đợt 1 - 11h00' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  roundLabel?: string;

  @ApiProperty({ example: 80 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  servingsServed!: number;

  @ApiProperty({ example: 80 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  peopleServed!: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  leftoverServings?: number;

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

  @ApiPropertyOptional({ example: 'Phát tại cổng bệnh viện.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateMealFeedbackDto {
  @ApiProperty({ example: 5, description: 'Mức hài lòng 1–5' })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  satisfaction!: number;

  @ApiPropertyOptional({ example: 'Cơm ngon, phục vụ chu đáo.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
