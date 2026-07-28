import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BusinessType, UserRole } from '@foodresq/types';

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

  // ── Provider verification (mở rộng P3) ────────────────────────────────────

  @ApiPropertyOptional({
    enum: BusinessType,
    description: 'Provider: loại hình kinh doanh (bắt buộc nếu role=provider)',
  })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiPropertyOptional({
    example: '0312345678',
    description:
      'Provider: mã số thuế (10–13 chữ số). Bắt buộc nếu businessType ∈ {restaurant, supermarket, bakery, hotel}; không bắt buộc với "other".',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10,13}$/, {
    message: 'Mã số thuế phải gồm 10–13 chữ số',
  })
  taxCode?: string;

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

  @ApiPropertyOptional({
    description: 'Provider: mô tả ngắn về cửa hàng',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Provider: ảnh minh chứng (GPKD/giấy ĐKKD ở index 0, các ảnh khác là mặt tiền/kệ/biển hiệu). Upload qua POST /uploads/register-evidence trước khi gửi register — trả về đường dẫn tương đối /uploads/verifications/...',
  })
  @IsOptional()
  @IsArray()
  // Upload trả đường dẫn tương đối (/uploads/...) — @IsUrl sẽ đánh rớt (và còn chặn
  // cả http://localhost vì require_tld), nên chỉ chấp nhận đúng 2 dạng an toàn này.
  @IsString({ each: true })
  @Matches(/^(\/uploads\/|https?:\/\/)/, {
    each: true,
    message: 'Mỗi ảnh minh chứng phải là đường dẫn /uploads/... hoặc URL http(s)',
  })
  evidenceUrls?: string[];
}
