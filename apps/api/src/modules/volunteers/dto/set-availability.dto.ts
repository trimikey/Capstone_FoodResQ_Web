import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateLocationDto {
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
}

export class SetAvailabilityDto {
  @ApiProperty({ example: true, description: 'Bật/tắt trạng thái sẵn sàng nhận đơn' })
  @IsBoolean()
  isAvailable!: boolean;

  @ApiPropertyOptional({ example: 106.6297, description: 'Kinh độ vị trí hiện tại' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 10.8231, description: 'Vĩ độ vị trí hiện tại' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;
}
