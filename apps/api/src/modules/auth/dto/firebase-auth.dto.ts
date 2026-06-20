import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@foodresq/types';

export class FirebaseAuthDto {
  @ApiProperty({ description: 'Firebase ID token lấy từ client sau khi đăng nhập Google/Phone' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @ApiPropertyOptional({
    enum: [UserRole.PROVIDER, UserRole.RECEIVER, UserRole.VOLUNTEER],
    description: 'Vai trò mong muốn khi tạo tài khoản mới (mặc định receiver nếu bỏ trống)',
  })
  @IsOptional()
  @IsEnum([UserRole.PROVIDER, UserRole.RECEIVER, UserRole.VOLUNTEER])
  role?: UserRole.PROVIDER | UserRole.RECEIVER | UserRole.VOLUNTEER;
}
