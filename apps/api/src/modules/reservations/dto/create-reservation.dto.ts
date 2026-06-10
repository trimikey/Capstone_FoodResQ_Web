import { IsUUID, IsNumber, IsPositive, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReservationDto {
  @ApiProperty({ example: 'uuid-of-listing' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Giao trước 10h sáng nếu có thể' })
  @IsOptional()
  @IsString()
  receiverNotes?: string;

  @ApiPropertyOptional({ description: 'Yêu cầu giao hàng tận nơi qua shipper' })
  @IsOptional()
  @IsBoolean()
  requestDelivery?: boolean;
}
