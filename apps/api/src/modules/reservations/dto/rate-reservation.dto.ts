import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Đối tượng được đánh giá trong một đơn: cửa hàng (mặc định) hoặc shipper đã giao. */
export type RateTarget = 'provider' | 'shipper';

export class RateReservationDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({ example: 'Thực phẩm tươi ngon, cảm ơn cửa hàng!' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({
    enum: ['provider', 'shipper'],
    default: 'provider',
    description: 'Đánh giá cửa hàng hay tình nguyện viên đã giao. Bỏ trống = cửa hàng.',
  })
  @IsOptional()
  @IsIn(['provider', 'shipper'])
  target?: RateTarget;
}
