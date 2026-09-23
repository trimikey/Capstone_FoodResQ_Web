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

  @ApiPropertyOptional({ description: 'Legacy QR token, khong con bat buoc khi chuyen sang delivered' })
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
