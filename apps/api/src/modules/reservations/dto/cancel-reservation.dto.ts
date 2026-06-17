import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelReservationDto {
  @ApiPropertyOptional({ example: 'Bận việc đột xuất, không đến lấy được' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
