import {
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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AssignmentRole } from '@foodresq/types';

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
}

export class ApplyCampaignDto {
  @ApiProperty({ enum: AssignmentRole })
  @IsEnum(AssignmentRole)
  role!: AssignmentRole;
}
