import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^0[35789][0-9]{8}$/, {
    message: 'Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam.',
  })
  phone?: string;

  @ApiPropertyOptional({ example: '/uploads/avatars/avatar.webp' })
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/\S+|\/uploads\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+)$/, {
    message: 'Ảnh đại diện phải là URL hợp lệ hoặc ảnh đã tải lên hệ thống.',
  })
  avatarUrl?: string;

  // ── Địa chỉ + vị trí (provider: vị trí cửa hàng · receiver: điểm giao) ────

  @ApiPropertyOptional({ example: '12 Nguyễn Huệ, Q1, TP.HCM' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 106.6297 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 10.8231 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;
}
