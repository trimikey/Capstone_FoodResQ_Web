import {
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, BusinessType } from '@foodresq/types';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*[0-9])/, {
    message: 'Password must contain at least one uppercase letter and one number',
  })
  password!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ enum: [UserRole.PROVIDER, UserRole.RECEIVER, UserRole.VOLUNTEER] })
  @IsEnum([UserRole.PROVIDER, UserRole.RECEIVER, UserRole.VOLUNTEER])
  role!: UserRole.PROVIDER | UserRole.RECEIVER | UserRole.VOLUNTEER;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^0[35789][0-9]{8}$/, {
    message: 'Phone must be a valid Vietnamese mobile number',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'Tiệm bánh Hạnh Phúc', description: 'Provider: tên cửa hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessName?: string;

  @ApiPropertyOptional({ example: '12 Nguyễn Huệ, Q1, TP.HCM' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ enum: BusinessType, description: 'Provider: loại hình cơ sở' })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiPropertyOptional({ example: 10.7769, description: 'Provider: vĩ độ cơ sở' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 106.7009, description: 'Provider: kinh độ cơ sở' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Xe máy', description: 'Volunteer: phương tiện' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleType?: string;

  @ApiPropertyOptional({ example: 'shipper', description: 'Volunteer: role (shipper, chef, waiter)' })
  @IsOptional()
  @IsEnum(['shipper', 'chef', 'waiter'])
  volunteerRole?: 'shipper' | 'chef' | 'waiter';

  @ApiPropertyOptional({ example: true, description: 'Charity: is a charity organization' })
  @IsOptional()
  isCharityOrg?: boolean;
}
