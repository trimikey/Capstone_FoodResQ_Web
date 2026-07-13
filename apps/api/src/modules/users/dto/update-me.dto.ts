import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'Đường T8, Vinhomes Grand Park, TP.HCM' })
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Địa chỉ phải có ít nhất 5 ký tự.' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự.' })
  address?: string;

  @ApiPropertyOptional({ example: 106.8293 })
  @IsOptional()
  @IsNumber({}, { message: 'Kinh độ phải là một số hợp lệ.' })
  @Min(-180, { message: 'Kinh độ phải nằm trong khoảng -180 đến 180.' })
  @Max(180, { message: 'Kinh độ phải nằm trong khoảng -180 đến 180.' })
  lng?: number;

  @ApiPropertyOptional({ example: 10.8412 })
  @IsOptional()
  @IsNumber({}, { message: 'Vĩ độ phải là một số hợp lệ.' })
  @Min(-90, { message: 'Vĩ độ phải nằm trong khoảng -90 đến 90.' })
  @Max(90, { message: 'Vĩ độ phải nằm trong khoảng -90 đến 90.' })
  lat?: number;
}
