import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Shipper báo sự cố (multipart: ảnh ở field `photo`, tuỳ chọn). */
export class ReportCampaignIncidentDto {
  @ApiProperty({ enum: ['pickup', 'distribution'], description: 'Đang đi lấy nguyên liệu hay đi phát suất ăn' })
  @IsIn(['pickup', 'distribution'], { message: 'Loại việc chỉ nhận pickup | distribution' })
  context!: 'pickup' | 'distribution';

  @ApiPropertyOptional({ description: 'ID đơn nguyên liệu (pickup) hoặc đợt phát (distribution)' })
  @IsOptional()
  @IsUUID('4', { message: 'ID việc không hợp lệ' })
  referenceId?: string;

  @ApiProperty({ example: 'vehicle_broken', description: "Mã lý do chọn sẵn, hoặc 'other' khi nhập tay" })
  @IsString()
  @MaxLength(40)
  reasonCode!: string;

  @ApiPropertyOptional({ description: 'Mô tả thêm — bắt buộc khi reasonCode = other' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự' })
  detail?: string;

  /** false = không đi tiếp được → gỡ shipper khỏi việc để tổ chức đổi người. Mặc định true. */
  @ApiPropertyOptional({ example: true, description: 'Shipper còn tiếp tục được không' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'canContinue phải là true/false' })
  canContinue?: boolean;

  @ApiPropertyOptional({ example: 30, description: 'Vẫn tiếp tục nhưng trễ khoảng bao nhiêu phút' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số phút trễ phải là số nguyên' })
  @Min(0)
  @Max(600, { message: 'Trễ tối đa 600 phút' })
  delayMinutes?: number;
}

/** Tổ chức đổi shipper cho việc bị bỏ dở vì sự cố. */
export class ReassignCampaignIncidentDto {
  @ApiProperty({
    type: [String],
    description:
      'Người nhận việc thay: assignment id (đơn nguyên liệu) hoặc volunteer_profile id (đợt phát)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một người thay' })
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true, message: 'ID người thay không hợp lệ' })
  ids!: string[];
}

export class ResolveCampaignIncidentDto {
  @ApiPropertyOptional({ description: 'Tổ chức ghi cách đã xử lý' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}
