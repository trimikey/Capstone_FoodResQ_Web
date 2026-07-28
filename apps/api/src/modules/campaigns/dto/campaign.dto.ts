import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { AssignmentRole } from '@foodresq/types';

export class MenuItemDto {
  @ApiProperty({ example: 'Cơm thịt kho tàu' })
  @IsString({ message: 'Tên món phải là chuỗi' })
  @MinLength(1, { message: 'Tên món không được để trống' })
  @MaxLength(120, { message: 'Tên món tối đa 120 ký tự' })
  name!: string;
  @ApiProperty({ example: 'Món chính' })
  @IsString({ message: 'Loại món phải là chuỗi' })
  @MaxLength(60, { message: 'Loại món tối đa 60 ký tự' })
  type!: string;
  @ApiPropertyOptional({ example: 150, description: 'Số suất dự kiến cho món này' })
  @IsOptional()
  @IsInt({ message: 'Số suất dự kiến phải là số nguyên' })
  @Min(0, { message: 'Số suất dự kiến không được âm' })
  @Max(10000, { message: 'Số suất dự kiến tối đa 10.000' })
  @Type(() => Number)
  plannedServings?: number;
  @ApiPropertyOptional({ description: 'ID công thức trong thư viện (bỏ trống nếu món tự do)' })
  @IsOptional()
  @IsUUID('4', { message: 'ID công thức không hợp lệ' })
  recipeId?: string;
}

export class ScheduleItemDto {
  @ApiProperty({ example: '06:00 - 08:00' })
  @IsString({ message: 'Giờ phải là chuỗi' })
  @MaxLength(40, { message: 'Giờ tối đa 40 ký tự' })
  time!: string;
  @ApiProperty({ example: 'Chuẩn bị nguyên liệu & Sơ chế' })
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MinLength(1, { message: 'Mô tả không được để trống' })
  @MaxLength(160, { message: 'Mô tả tối đa 160 ký tự' })
  label!: string;
}

/** Vật phẩm cần thiết — cho phép gửi string ngắn `{name}` hoặc đầy đủ `{name, quantity, unit}`. */
export class SupplyItemDto {
  @ApiProperty({ example: 'Gạo sạch' })
  @IsString({ message: 'Tên vật phẩm phải là chuỗi' })
  @MinLength(1, { message: 'Tên vật phẩm không được để trống' })
  @MaxLength(80, { message: 'Tên vật phẩm tối đa 80 ký tự' })
  name!: string;
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber({ allowNaN: false }, { message: 'Số lượng phải là số' })
  @Min(0, { message: 'Số lượng không được âm' })
  @Type(() => Number)
  quantity?: number;
  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString({ message: 'Đơn vị phải là chuỗi' })
  @MaxLength(20, { message: 'Đơn vị tối đa 20 ký tự' })
  unit?: string;
}

/** Ca trực cho tình nguyện viên — cùng shape với CreateShiftDto nhưng dùng trong create-campaign. */
export class ShiftInputDto {
  @ApiProperty({ example: 'Ca sáng - Sơ chế & nấu' })
  @IsString({ message: 'Tên ca phải là chuỗi' })
  @MinLength(2, { message: 'Tên ca tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Tên ca tối đa 100 ký tự' })
  label!: string;
  @ApiPropertyOptional({ enum: AssignmentRole, description: 'Ca dành cho vai trò nào (bỏ trống = chung)' })
  @IsOptional()
  @IsEnum(AssignmentRole, { message: 'Vai trò ca không hợp lệ (chỉ chấp nhận: chef / waiter / shipper)' })
  role?: AssignmentRole;
  @ApiProperty({ example: '06:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ bắt đầu phải đúng định dạng HH:mm (vd: 06:00)' })
  startTime!: string;
  @ApiProperty({ example: '10:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ kết thúc phải đúng định dạng HH:mm (vd: 10:00)' })
  endTime!: string;
  @ApiProperty({ example: 4 })
  @IsInt({ message: 'Số người cần phải là số nguyên' })
  @Min(0, { message: 'Số người cần không được âm' })
  @Max(100, { message: 'Số người cần tối đa 100' })
  @Type(() => Number)
  slotsNeeded!: number;
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'Bếp ăn 0 đồng cuối tuần' })
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  @MinLength(5, { message: 'Tiêu đề tối thiểu 5 ký tự' })
  @MaxLength(255, { message: 'Tiêu đề tối đa 255 ký tự' })
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(5000, { message: 'Mô tả tối đa 5000 ký tự' })
  description?: string;

  @ApiProperty({ example: '210 Lê Quang Định, Bình Thạnh' })
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @MinLength(5, { message: 'Địa chỉ tối thiểu 5 ký tự' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  kitchenAddress!: string;

  @ApiProperty({ example: 106.6297 })
  @IsNumber({ allowNaN: false }, { message: 'Kinh độ phải là số' })
  @Min(-180, { message: 'Kinh độ tối thiểu -180' })
  @Max(180, { message: 'Kinh độ tối đa 180' })
  @Type(() => Number)
  lng!: number;

  @ApiProperty({ example: 10.8231 })
  @IsNumber({ allowNaN: false }, { message: 'Vĩ độ phải là số' })
  @Min(-90, { message: 'Vĩ độ tối thiểu -90' })
  @Max(90, { message: 'Vĩ độ tối đa 90' })
  @Type(() => Number)
  lat!: number;

  @ApiProperty({ example: '2026-06-20' })
  @IsDateString({}, { message: 'Ngày tổ chức phải đúng định dạng YYYY-MM-DD' })
  scheduledDate!: string;

  @ApiProperty({ example: '08:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ bắt đầu phải đúng định dạng HH:mm (vd: 08:00)' })
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ kết thúc phải đúng định dạng HH:mm (vd: 12:00)' })
  endTime!: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt({ message: 'Số đầu bếp phải là số nguyên' })
  @Min(0, { message: 'Số đầu bếp không được âm' })
  @Max(50, { message: 'Số đầu bếp tối đa 50' })
  @Type(() => Number)
  chefSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt({ message: 'Số phục vụ phải là số nguyên' })
  @Min(0, { message: 'Số phục vụ không được âm' })
  @Max(50, { message: 'Số phục vụ tối đa 50' })
  @Type(() => Number)
  waiterSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt({ message: 'Số giao hàng phải là số nguyên' })
  @Min(0, { message: 'Số giao hàng không được âm' })
  @Max(50, { message: 'Số giao hàng tối đa 50' })
  @Type(() => Number)
  shipperSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt({ message: 'Số suất dự kiến phải là số nguyên' })
  @Min(1, { message: 'Số suất dự kiến tối thiểu 1' })
  @Max(100000, { message: 'Số suất dự kiến tối đa 100.000' })
  @Type(() => Number)
  expectedServings?: number;

  @ApiPropertyOptional({ example: ['/uploads/campaigns/abc.jpg'], description: 'Ảnh chiến dịch (URL trả về từ /campaigns/upload-image)' })
  @IsOptional()
  @IsArray({ message: 'Danh sách ảnh phải là mảng' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 ảnh' })
  @IsString({ each: true, message: 'Mỗi URL ảnh phải là chuỗi' })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: [MenuItemDto], description: 'Thực đơn trong ngày' })
  @IsOptional()
  @IsArray({ message: 'Thực đơn phải là mảng' })
  @ArrayMaxSize(20, { message: 'Thực đơn tối đa 20 món' })
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menuItems?: MenuItemDto[];

  @ApiPropertyOptional({ type: [ScheduleItemDto], description: 'Lịch trình hoạt động' })
  @IsOptional()
  @IsArray({ message: 'Lịch trình phải là mảng' })
  @ArrayMaxSize(20, { message: 'Lịch trình tối đa 20 mốc' })
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  scheduleItems?: ScheduleItemDto[];

  @ApiPropertyOptional({
    description: 'Vật phẩm cần thiết — chấp nhận string[] (vd: "Gạo sạch") hoặc object[] đầy đủ {name, quantity?, unit?}',
    examples: [
      { value: ['Gạo sạch', 'Dầu ăn'], summary: 'Dạng string ngắn' },
      { value: [{ name: 'Gạo sạch', quantity: 10, unit: 'kg' }], summary: 'Dạng object đầy đủ' },
    ],
  })
  @IsOptional()
  @IsArray({ message: 'Vật phẩm phải là mảng' })
  @ArrayMaxSize(30, { message: 'Vật phẩm tối đa 30 mục' })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    // Chuẩn hoá từng phần tử thành object {name, quantity, unit} — chấp nhận cả string[] cũ.
    // Quan trọng: KHÔNG thêm thuộc tính ngoài whitelist (ví dụ __orig_index) vì
    // ValidationPipe có forbidNonWhitelisted:true sẽ reject ngay.
    return value
      .map((v) => {
        if (typeof v === 'string') return { name: v };
        if (v && typeof v === 'object') return v;
        return null;
      })
      .filter((v): v is Record<string, unknown> => v !== null);
  })
  @ValidateNested({ each: true })
  @Type(() => SupplyItemDto)
  supplyItems?: SupplyItemDto[];

  @ApiPropertyOptional({ type: [ShiftInputDto], description: 'Ca trực cho tình nguyện viên (tạo trước cùng chiến dịch)' })
  @IsOptional()
  @IsArray({ message: 'Ca trực phải là mảng' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 ca trực' })
  @ValidateNested({ each: true })
  @Type(() => ShiftInputDto)
  shifts?: ShiftInputDto[];
}

export class ApplyCampaignDto {
  @ApiProperty({ enum: AssignmentRole })
  @IsEnum(AssignmentRole, { message: 'Vai trò không hợp lệ (chỉ chấp nhận: chef / waiter / shipper)' })
  role!: AssignmentRole;
}

export class AddExperienceDto {
  @ApiProperty({ example: 'Một buổi sáng thật ý nghĩa, được nấu và trao tận tay những suất cơm ấm...' })
  @IsString({ message: 'Cảm nhận phải là chuỗi' })
  @MinLength(5, { message: 'Cảm nhận tối thiểu 5 ký tự' })
  @MaxLength(2000, { message: 'Cảm nhận tối đa 2000 ký tự' })
  content!: string;

  @ApiPropertyOptional({ example: 5, description: 'Chấm điểm trải nghiệm 1-5 (tuỳ chọn)' })
  @IsOptional()
  @IsInt({ message: 'Điểm đánh giá phải là số nguyên' })
  @Min(1, { message: 'Điểm đánh giá tối thiểu 1' })
  @Max(5, { message: 'Điểm đánh giá tối đa 5' })
  @Type(() => Number)
  rating?: number;

  @ApiPropertyOptional({ type: [String], description: 'URL ảnh đã upload kèm cảm nhận' })
  @IsOptional()
  @IsArray({ message: 'Danh sách ảnh phải là mảng' })
  @IsString({ each: true, message: 'Mỗi URL ảnh phải là chuỗi' })
  @ArrayMaxSize(6, { message: 'Tối đa 6 ảnh' })
  imageUrls?: string[];
}

export class CompleteCampaignDto {
  @ApiProperty({ example: 150, description: 'Số suất ăn thực tế đã phục vụ' })
  @IsInt({ message: 'Số suất phải là số nguyên' })
  @Min(0, { message: 'Số suất không được âm' })
  @Type(() => Number)
  actualServings!: number;
}

export class PledgeDonationDto {
  @ApiProperty({ example: 'Gạo' })
  @IsString({ message: 'Tên vật phẩm phải là chuỗi' })
  @MinLength(1, { message: 'Tên vật phẩm không được để trống' })
  @MaxLength(255, { message: 'Tên vật phẩm tối đa 255 ký tự' })
  itemName!: string;
  @ApiPropertyOptional({ example: '20 kg' })
  @IsOptional()
  @IsString({ message: 'Số lượng phải là chuỗi' })
  @MaxLength(100, { message: 'Số lượng tối đa 100 ký tự' })
  quantity?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

/** Charity gửi yêu cầu hợp tác đến provider */
export class SendProviderRequestDto {
  @ApiProperty()
  @IsUUID('4', { message: 'ID nhà cung cấp không hợp lệ' })
  providerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'ID chiến dịch không hợp lệ' })
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Tin nhắn phải là chuỗi' })
  @MaxLength(500, { message: 'Tin nhắn tối đa 500 ký tự' })
  message?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 36 })
  @IsOptional()
  @IsInt({ message: 'Thời hạn phải là số nguyên' })
  @Min(1, { message: 'Thời hạn tối thiểu 1 tháng' })
  @Max(36, { message: 'Thời hạn tối đa 36 tháng' })
  durationMonths?: number;
}

/**
 * Charity đề xuất THÊM/GIA HẠN một NCC mới khi chưa có provider nào trong hệ thống
 * (hoặc muốn mời thêm NCC mới).
 * Backend sẽ tạo 1 record ProviderProposal, admin duyệt mới tạo ProviderProfile thực tế.
 * durationMonths: thời hạn hợp tác mong muốn (mặc định 1 tháng).
 */
export class SubmitProviderProposalDto {
  @ApiProperty({ example: 'Bếp ăn Mặt Trời' })
  @IsString({ message: 'Tên bếp phải là chuỗi' })
  @MinLength(3, { message: 'Tên bếp tối thiểu 3 ký tự' })
  @MaxLength(255, { message: 'Tên bếp tối đa 255 ký tự' })
  businessName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Tên liên hệ phải là chuỗi' })
  @MaxLength(120, { message: 'Tên liên hệ tối đa 120 ký tự' })
  contactName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự' })
  contactPhone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  contactEmail?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(1000, { message: 'Ghi chú tối đa 1000 ký tự' })
  note?: string;
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 24 })
  @IsOptional()
  @IsInt({ message: 'Thời hạn phải là số nguyên' })
  @Min(1, { message: 'Thời hạn tối thiểu 1 tháng' })
  @Max(24, { message: 'Thời hạn tối đa 24 tháng' })
  durationMonths?: number;
}

/**
 * Tổ chức gửi YÊU CẦU thay đổi chiến dịch (chờ admin duyệt).
 * Mọi trường đều optional — chỉ gửi trường muốn đổi (bỏ trống = giữ nguyên).
 * lng & lat phải đi cùng nhau; phải có ít nhất một trường thay đổi (kiểm tra ở service).
 */
export class SubmitCampaignChangeDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày phải đúng định dạng YYYY-MM-DD' })
  scheduledDate?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ bắt đầu phải đúng định dạng HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ kết thúc phải đúng định dạng HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ example: '210 Lê Quang Định, Bình Thạnh' })
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @MinLength(5, { message: 'Địa chỉ tối thiểu 5 ký tự' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  kitchenAddress?: string;

  @ApiPropertyOptional({ example: 106.6297 })
  @IsOptional()
  @IsNumber({ allowNaN: false }, { message: 'Kinh độ phải là số' })
  @Min(-180, { message: 'Kinh độ tối thiểu -180' })
  @Max(180, { message: 'Kinh độ tối đa 180' })
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 10.8231 })
  @IsOptional()
  @IsNumber({ allowNaN: false }, { message: 'Vĩ độ phải là số' })
  @Min(-90, { message: 'Vĩ độ tối thiểu -90' })
  @Max(90, { message: 'Vĩ độ tối đa 90' })
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt({ message: 'Số đầu bếp phải là số nguyên' })
  @Min(0, { message: 'Số đầu bếp không được âm' })
  @Max(50, { message: 'Số đầu bếp tối đa 50' })
  @Type(() => Number)
  chefSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt({ message: 'Số phục vụ phải là số nguyên' })
  @Min(0, { message: 'Số phục vụ không được âm' })
  @Max(50, { message: 'Số phục vụ tối đa 50' })
  @Type(() => Number)
  waiterSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt({ message: 'Số giao hàng phải là số nguyên' })
  @Min(0, { message: 'Số giao hàng không được âm' })
  @Max(50, { message: 'Số giao hàng tối đa 50' })
  @Type(() => Number)
  shipperSlotsNeeded?: number;

  @ApiPropertyOptional({ example: 'Đổi giờ vì bếp bận buổi sáng', description: 'Lý do thay đổi' })
  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  reason?: string;
}

// ─── Manage: Duyệt / từ chối TNV đã đăng ký ──────────────────────────────────
export class ReviewAssignmentDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsString()
  @IsIn(['approved', 'rejected'], { message: 'action chỉ chấp nhận approved | rejected' })
  action!: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'Cảm ơn bạn đã đăng ký!' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

// ─── Manage: Tạo đợt phát suất ăn ────────────────────────────────────────────
export class CreateDistributionDto {
  @ApiProperty({ example: 150, description: 'Số suất đã phát' })
  @IsInt({ message: 'Số suất phải là số nguyên' })
  @Min(0, { message: 'Số suất không được âm' })
  @Max(100000, { message: 'Số suất tối đa 100.000' })
  @Type(() => Number)
  servingsServed!: number;

  @ApiProperty({ example: 150, description: 'Số người nhận' })
  @IsInt({ message: 'Số người phải là số nguyên' })
  @Min(0, { message: 'Số người không được âm' })
  @Max(100000, { message: 'Số người tối đa 100.000' })
  @Type(() => Number)
  peopleServed!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt({ message: 'Số suất thừa phải là số nguyên' })
  @Min(0, { message: 'Số suất thừa không được âm' })
  @Max(100000)
  @Type(() => Number)
  leftoverServings?: number;

  @ApiPropertyOptional({ example: 'Đợt 1 — trưa nay' })
  @IsOptional()
  @IsString({ message: 'Tên đợt phải là chuỗi' })
  @MaxLength(100, { message: 'Tên đợt tối đa 100 ký tự' })
  roundLabel?: string;

  @ApiPropertyOptional({ example: 'Phát tại cổng trường tiểu học A' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

// ─── Manage: Thêm/sửa ca trực ───────────────────────────────────────────────
export class CreateShiftDto {
  @ApiProperty({ example: 'Ca sáng - Sơ chế' })
  @IsString({ message: 'Tên ca phải là chuỗi' })
  @MinLength(2, { message: 'Tên ca tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Tên ca tối đa 100 ký tự' })
  label!: string;

  @ApiPropertyOptional({ enum: AssignmentRole })
  @IsOptional()
  @IsEnum(AssignmentRole)
  role?: AssignmentRole;

  @ApiProperty({ example: '06:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ bắt đầu phải đúng định dạng HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '10:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ kết thúc phải đúng định dạng HH:mm' })
  endTime!: string;

  @ApiProperty({ example: 4 })
  @IsInt({ message: 'Số người cần phải là số nguyên' })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  slotsNeeded!: number;
}

export class UpdateShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ enum: AssignmentRole })
  @IsOptional()
  @IsEnum(AssignmentRole)
  role?: AssignmentRole;

  @ApiPropertyOptional({ example: '06:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  slotsNeeded?: number;
}

// ─── Manage: Thêm vật phẩm / món vào thực đơn (sau khi tạo campaign) ─────────
export class AppendMenuItemDto {
  @ApiProperty({ example: 'Cơm thịt kho' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'lunch' })
  @IsString()
  @MaxLength(60)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  @Type(() => Number)
  plannedServings?: number;
}

export class AppendSupplyItemDto {
  @ApiProperty({ example: 'Gạo sạch' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowNaN: false })
  @Min(0)
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
}
