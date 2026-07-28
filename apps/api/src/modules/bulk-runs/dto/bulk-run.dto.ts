import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestBulkRunDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ example: 15, description: 'Số phần muốn nhận giao sỉ (tối thiểu theo BULK_MIN_QTY)' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Dự kiến phát dọc tuyến Võ Văn Ngân → KTX khu A' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectBulkRunDto {
  @ApiPropertyOptional({ example: 'Số lượng còn lại cần giữ cho khách lẻ' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AddStopDto {
  @ApiProperty({ example: 'Điểm phát cầu Sài Gòn' })
  @IsString()
  @MaxLength(255)
  label!: string;

  @ApiPropertyOptional({ example: 'Chân cầu Sài Gòn, P. Thảo Điền' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ example: 106.72 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng!: number;

  @ApiProperty({ example: 10.8 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat!: number;

  @ApiPropertyOptional({ example: 5, description: 'Số phần dự kiến phát tại điểm này' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  plannedQty?: number;
}

export class ServeStopDto {
  @ApiProperty({ example: 5, description: 'Số phần đã phát tại điểm này' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  servedQty!: number;

  @ApiPropertyOptional({ example: 'Phát cho nhóm lao động tự do ~5 người' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
