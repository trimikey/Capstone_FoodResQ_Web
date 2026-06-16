import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
