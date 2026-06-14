import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScanQrDto {
  @ApiProperty({ example: 'a1b2c3...64-hex-chars', description: 'QR token (64 hex chars)' })
  @IsString()
  @Length(64, 64)
  qrToken!: string;
}
