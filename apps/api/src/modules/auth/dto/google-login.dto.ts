import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token (credential) trả về từ Google Identity Services' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
