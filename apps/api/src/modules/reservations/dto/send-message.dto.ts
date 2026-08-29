import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'Nội dung tin nhắn (1–1000 ký tự)' })
  @IsString()
  @Length(1, 1000)
  content!: string;
}
