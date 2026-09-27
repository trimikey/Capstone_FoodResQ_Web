import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
}

export class ResolveCampaignIncidentDto {
  @ApiPropertyOptional({ description: 'Tổ chức ghi cách đã xử lý' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}
