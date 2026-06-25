import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FirebaseLoginDto {
  @ApiProperty({ description: 'Firebase ID token lấy từ client (Google sign-in hoặc Phone OTP)' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @ApiPropertyOptional({ description: 'Role mong muốn khi tạo tài khoản mới', enum: ['receiver', 'volunteer', 'provider'] })
  @IsOptional()
  @IsIn(['receiver', 'volunteer', 'provider'])
  role?: 'receiver' | 'volunteer' | 'provider';
}
