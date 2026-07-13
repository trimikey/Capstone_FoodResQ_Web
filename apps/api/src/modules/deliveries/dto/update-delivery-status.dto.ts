import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from '@foodresq/types';

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @ApiPropertyOptional({ description: 'URL ảnh QC / proof giao hàng' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  proofUrl?: string;

  @ApiPropertyOptional({ description: 'Mã QR của người nhận — bắt buộc khi chuyển sang delivered (xác nhận bàn giao đúng người)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  qrToken?: string;
}

export class RejectOfferDto {
  @ApiPropertyOptional({ example: 'Đang bận đơn khác' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
