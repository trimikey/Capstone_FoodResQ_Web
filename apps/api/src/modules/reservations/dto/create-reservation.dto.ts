import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReservationDto {
  @ApiProperty({ example: 'uuid-of-listing' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsPositive()
  @Max(10)
  @Type(() => Number)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Giao trước 10h sáng nếu có thể' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiverNotes?: string;

  @ApiPropertyOptional({ description: 'Yêu cầu giao hàng tận nơi qua shipper' })
  @IsOptional()
  @IsBoolean()
  requestDelivery?: boolean;

  @ApiPropertyOptional({
    description:
      'URL ảnh bằng chứng khó di chuyển (bệnh, gãy chân…) — BẮT BUỘC khi requestDelivery=true; shipper xem trước khi nhận đơn.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  deliveryEvidenceUrl?: string;

  // ─── Điểm giao riêng cho đơn này (tuỳ chọn) ────────────────────────────────
  // Người khó di chuyển có thể đang nằm viện hoặc ở nhà người thân, không phải
  // địa chỉ trong hồ sơ. Bỏ trống cả ba trường = giao về địa chỉ hồ sơ như cũ.
  @ApiPropertyOptional({ example: 106.6297, description: 'Kinh độ điểm giao (gửi kèm deliveryLat)' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Kinh độ điểm giao phải là số' })
  @Min(-180, { message: 'Kinh độ tối thiểu -180' })
  @Max(180, { message: 'Kinh độ tối đa 180' })
  @Type(() => Number)
  deliveryLng?: number;

  @ApiPropertyOptional({ example: 10.8231, description: 'Vĩ độ điểm giao (gửi kèm deliveryLng)' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Vĩ độ điểm giao phải là số' })
  @Min(-90, { message: 'Vĩ độ tối thiểu -90' })
  @Max(90, { message: 'Vĩ độ tối đa 90' })
  @Type(() => Number)
  deliveryLat?: number;

  @ApiPropertyOptional({ example: '12 Trần Phú, Nha Trang (Khoa Nội, giường 12)' })
  @IsOptional()
  @IsString({ message: 'Địa chỉ giao phải là chuỗi' })
  @MaxLength(500, { message: 'Địa chỉ giao tối đa 500 ký tự' })
  deliveryAddress?: string;
}
