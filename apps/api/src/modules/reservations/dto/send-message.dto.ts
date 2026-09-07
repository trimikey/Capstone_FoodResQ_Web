import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'Nội dung tin nhắn (1–1000 ký tự)' })
  @IsString()
  @Length(1, 1000)
  content!: string;

  @ApiPropertyOptional({ description: 'Người nhận tin (userId của một bên trong đơn) — bỏ trống thì lấy bên mặc định theo vai' })
  @IsOptional()
  @IsUUID()
  toUserId?: string;
}
