import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SaveDeviceTokenDto {
  @ApiProperty({
    description: 'FCM registration token của thiết bị/trình duyệt',
  })
  @IsString()
  @MinLength(16)
  token!: string;

  @ApiPropertyOptional({ enum: ['web', 'ios', 'android'], default: 'web' })
  @IsOptional()
  @IsIn(['web', 'ios', 'android'])
  platform?: 'web' | 'ios' | 'android';
}
