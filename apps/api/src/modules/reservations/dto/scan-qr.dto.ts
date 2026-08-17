import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScanQrDto {
  @ApiProperty({
    example: 'F1A9C02B',
    description: 'QR token đầy đủ hoặc mã nhập tay ngắn hiển thị dưới QR',
  })
  @IsString()
  @Length(6, 64)
  qrToken!: string;
}
