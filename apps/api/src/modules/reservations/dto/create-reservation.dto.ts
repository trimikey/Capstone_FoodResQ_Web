import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsBoolean,
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
}
