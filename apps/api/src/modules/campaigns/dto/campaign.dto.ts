import {
  IsArray,
  IsBoolean,
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
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { AssignmentRole, CampaignShiftPeriod, FoodCategory } from '@foodresq/types';

export class MenuItemDto {
  @ApiProperty({ example: 'Cơm thịt kho tàu' })
  @IsString({ message: 'Tên món phải là chuỗi' })
  @MinLength(1, { message: 'Tên món không được để trống' })
  @MaxLength(120, { message: 'Tên món tối đa 120 ký tự' })
  name!: string;
  // Toàn hệ thống (trang quản lý thực đơn, gom món theo bữa cho shipper) đọc `type`
  // như enum bữa ăn. Trước đây đây là chuỗi tự do 60 ký tự nên gửi "Món chính" vẫn
  // qua, và mọi món rơi vào nhóm "Chưa phân bữa" — phải sửa tay từng món sau đó.
  @ApiProperty({ enum: ['breakfast', 'lunch', 'dinner'], example: 'lunch' })
  @IsIn(['breakfast', 'lunch', 'dinner'], { message: 'Bữa ăn chỉ nhận: breakfast / lunch / dinner' })
  type!: 'breakfast' | 'lunch' | 'dinner';
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
  // allowInfinity mặc định là true: 1e400 → Infinity → JSON.stringify ghi thành null,
  // mất số lượng mục tiêu nên NCC không quyên góp vào vật phẩm đó được nữa.
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Số lượng phải là số' })
  @Min(0, { message: 'Số lượng không được âm' })
  @Max(100000, { message: 'Số lượng tối đa 100.000' })
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
  @ApiProperty({ enum: AssignmentRole, description: 'Vai trò cần tuyển trong ca' })
  @IsEnum(AssignmentRole, { message: 'Vai trò ca không hợp lệ (chỉ chấp nhận: chef / waiter / shipper)' })
  role!: AssignmentRole;
  @ApiProperty({ enum: CampaignShiftPeriod, example: CampaignShiftPeriod.MORNING })
  @IsEnum(CampaignShiftPeriod, { message: 'Ca chỉ nhận: midnight / morning / afternoon / evening' })
  period!: CampaignShiftPeriod;
  @ApiProperty({ example: 4 })
  @IsInt({ message: 'Số người cần phải là số nguyên' })
  @Min(1, { message: 'Mỗi định biên ca phải cần ít nhất 1 người' })
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

  // BẮT BUỘC dạng YYYY-MM-DD: service nối chuỗi `${scheduledDate}T00:00:00Z`, nên một
  // ISO datetime đầy đủ (@IsDateString vẫn cho qua) tạo ra Invalid Date và ném RangeError
  // → 500 thay vì 400. SubmitCampaignChangeDto đã dùng @Matches, create thì chưa đổi.
  @ApiProperty({ example: '2026-06-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày tổ chức phải đúng định dạng YYYY-MM-DD' })
  scheduledDate!: string;

  @ApiPropertyOptional({
    example: '2026-06-21',
    description:
      'Ngày kết thúc campaign (>= scheduledDate). Bỏ trống = 1 ngày duy nhất (mặc định = scheduledDate). Cron sẽ tự động chuyển sang trạng thái "Đã hoàn tất" sau endDate + endTime.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải đúng định dạng YYYY-MM-DD' })
  endDate?: string;

  @ApiProperty({ example: '2026-06-01T00:00:00+07:00' })
  @IsDateString({}, { message: 'Thời gian mở tuyển không hợp lệ' })
  recruitmentStartAt!: string;

  @ApiProperty({ example: '2026-06-19T00:00:00+07:00' })
  @IsDateString({}, { message: 'Thời gian đóng tuyển không hợp lệ' })
  recruitmentEndAt!: string;

  @ApiPropertyOptional({
    example: 24,
    deprecated: true,
    description: 'Không cần gửi. Máy chủ tự tính từ thời gian đóng tuyển đến giờ bắt đầu ca đầu tiên.',
  })
  @IsOptional()
  @IsInt({ message: 'Khoảng đệm tuyển phải là số nguyên' })
  @Min(6, { message: 'Khoảng đệm tuyển tối thiểu 6 giờ' })
  @Max(48, { message: 'Khoảng đệm tuyển tối đa 48 giờ' })
  @Type(() => Number)
  recruitmentBufferHours?: number;

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
  @MaxLength(500, { each: true, message: 'URL ảnh tối đa 500 ký tự' })
  imageUrls?: string[];

  @ApiProperty({ type: [MenuItemDto], description: 'Thực đơn bắt buộc của chiến dịch' })
  @IsArray({ message: 'Thực đơn phải là mảng' })
  @ArrayMinSize(1, { message: 'Chiến dịch phải có ít nhất một món' })
  @ArrayMaxSize(20, { message: 'Thực đơn tối đa 20 món' })
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menuItems!: MenuItemDto[];

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

  @ApiProperty({ type: [ShiftInputDto], description: 'Định biên theo ca cố định và vai trò' })
  @IsArray({ message: 'Ca trực phải là mảng' })
  @ArrayMinSize(1, { message: 'Chiến dịch phải có ít nhất một định biên ca' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 ca trực' })
  @ValidateNested({ each: true })
  @Type(() => ShiftInputDto)
  shifts!: ShiftInputDto[];
}

export class CancelCampaignDto {
  @ApiPropertyOptional({ description: 'Lý do huỷ — lưu vào chiến dịch và gửi kèm thông báo cho TNV / NCC' })
  @IsOptional()
  @IsString({ message: 'Lý do huỷ phải là chuỗi' })
  @MaxLength(500, { message: 'Lý do huỷ tối đa 500 ký tự' })
  reason?: string;
}

export class ExtendRecruitmentDto {
  @ApiProperty({ example: '2026-06-19T12:00:00+07:00' })
  @IsDateString({}, { message: 'Hạn tuyển mới không hợp lệ' })
  recruitmentEndAt!: string;
}

export class ConfirmCampaignAssignmentDto {
  @ApiProperty({ enum: ['confirmed', 'declined'] })
  @IsIn(['confirmed', 'declined'])
  decision!: 'confirmed' | 'declined';
}

export class ApplyCampaignDto {
  @ApiProperty({ enum: AssignmentRole })
  @IsEnum(AssignmentRole, { message: 'Vai trò không hợp lệ (chỉ chấp nhận: chef / waiter / shipper)' })
  role!: AssignmentRole;

  @ApiPropertyOptional({ description: 'Ca trực mong muốn; charity duyệt trước khi phân công chính thức' })
  @IsOptional()
  @IsUUID('4', { message: 'Ca trực không hợp lệ' })
  shiftId?: string;

  @ApiPropertyOptional({
    example: '2026-08-13',
    description: 'Ngày trực (YYYY-MM-DD). Bắt buộc khi chiến dịch diễn ra nhiều ngày.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày trực phải theo định dạng YYYY-MM-DD' })
  workDate?: string;
}

export class ReviewCampaignAssignmentDto {
  @ApiPropertyOptional({ enum: ['approved', 'rejected'], description: 'Mobile charity action: duyệt hoặc từ chối đăng ký TNV' })
  @IsOptional()
  @IsIn(['approved', 'rejected'])
  action?: 'approved' | 'rejected';

  @ApiPropertyOptional({ enum: ['approve', 'reject'], description: 'Alias tương thích với admin/web' })
  @IsOptional()
  @IsIn(['approve', 'reject'])
  decision?: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Ghi chú hoặc lý do từ chối' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdvanceCampaignTaskDto {
  @ApiPropertyOptional({ example: 106.6297, description: 'Kinh độ GPS tại thời điểm điểm danh' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Kinh độ phải là số' })
  @Min(-180, { message: 'Kinh độ tối thiểu -180' })
  @Max(180, { message: 'Kinh độ tối đa 180' })
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 10.8231, description: 'Vĩ độ GPS tại thời điểm điểm danh' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Vĩ độ phải là số' })
  @Min(-90, { message: 'Vĩ độ tối thiểu -90' })
  @Max(90, { message: 'Vĩ độ tối đa 90' })
  @Type(() => Number)
  lat?: number;
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
  // Có trần như mọi trường suất khác: con số này cộng thẳng vào thống kê công khai
  // ở trang chủ, gõ nhầm 2 tỷ là homepage hiện 2 tỷ suất (hoặc tràn INTEGER → 500).
  @ApiProperty({ example: 150, description: 'Số suất ăn thực tế đã phục vụ' })
  @IsInt({ message: 'Số suất phải là số nguyên' })
  @Min(0, { message: 'Số suất không được âm' })
  @Max(100000, { message: 'Số suất thực tế tối đa 100.000' })
  @Type(() => Number)
  actualServings!: number;

  /** Bắt buộc khi kết thúc sớm (chưa tới endDate / scheduledDate). Gửi 'EARLY_END' để xác nhận. */
  @ApiPropertyOptional({
    enum: ['EARLY_END'],
    description: 'Xác nhận chủ động kết thúc sớm (chỉ khi campaign chưa tới ngày kết thúc).',
  })
  @IsOptional()
  @IsIn(['EARLY_END'], { message: 'Giá trị xác nhận không hợp lệ.' })
  earlyEndConfirmation?: 'EARLY_END';

  /** Lý do kết thúc sớm (bắt buộc kèm earlyEndConfirmation). */
  @ApiPropertyOptional({ example: 'Thiếu nguyên liệu đột xuất, không thể tiếp tục' })
  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi' })
  @MinLength(5, { message: 'Lý do tối thiểu 5 ký tự' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  earlyEndReason?: string;
}

export class PledgeDonationDto {
  @ApiProperty({ example: 'Gạo' })
  @IsString({ message: 'Tên vật phẩm phải là chuỗi' })
  @MinLength(1, { message: 'Tên vật phẩm không được để trống' })
  @MaxLength(255, { message: 'Tên vật phẩm tối đa 255 ký tự' })
  itemName!: string;
  @ApiProperty({ example: 20, description: 'Số lượng provider cam kết theo đơn vị của vật phẩm mục tiêu' })
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Số lượng phải là số' })
  @Min(0.01, { message: 'Số lượng phải lớn hơn 0' })
  @Max(100000, { message: 'Số lượng tối đa 100.000' })
  @Type(() => Number)
  quantity!: number;
  @ApiPropertyOptional({ example: 'kg', description: 'Đơn vị hiển thị; phải khớp đơn vị mục tiêu nếu gửi lên' })
  @IsOptional()
  @IsString({ message: 'Đơn vị phải là chuỗi' })
  @MaxLength(20, { message: 'Đơn vị tối đa 20 ký tự' })
  unit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

export class ConfirmDonationDto {
  @ApiPropertyOptional({ description: 'Ghi chú khi xác nhận nhận hàng, ví dụ đủ số lượng hoặc chất lượng thực tế' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

/**
 * Charity phân công SHIPPER đi nhận quyên góp — nhận nhiều người cùng lúc.
 * Khung giờ lấy hàng phải nằm trong ca trực của TỪNG shipper — service validate
 * lại, DTO chỉ chặn sai định dạng.
 */
export class AssignDonationPickupDto {
  @ApiProperty({ description: 'DS id bản ghi phân công ca (campaign_volunteer_assignments) — chỉ vai trò Giao hàng', type: [String] })
  @IsArray({ message: 'assignmentIds phải là mảng' })
  @ArrayMinSize(1, { message: 'Chọn ít nhất 1 shipper' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 shipper cho một khoản góp' })
  @IsUUID('4', { each: true, message: 'assignmentIds phải là UUID' })
  assignmentIds!: string[];

  @ApiProperty({ example: '2026-08-18', description: 'Ngày lấy hàng — phải trùng ngày trực của TNV' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có dạng YYYY-MM-DD' })
  pickupDate!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'pickupStartTime phải có dạng HH:mm' })
  pickupStartTime!: string;

  @ApiProperty({ example: '10:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'pickupEndTime phải có dạng HH:mm' })
  pickupEndTime!: string;
}

/**
 * Charity phân công shipper CHIẾN DỊCH đi nhận đơn nguyên liệu NCC đã chấp nhận.
 * Không nhận ngày/giờ — dùng đúng lịch hẹn đã chốt trên đơn; service đối chiếu
 * ca trực của từng shipper với lịch đó.
 */
export class AssignRequestPickupDto {
  @ApiProperty({ description: 'DS id bản ghi phân công ca (campaign_volunteer_assignments) — chỉ vai trò Giao hàng', type: [String] })
  @IsArray({ message: 'assignmentIds phải là mảng' })
  @ArrayMinSize(1, { message: 'Chọn ít nhất 1 shipper' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 shipper cho một đơn' })
  @IsUUID('4', { each: true, message: 'assignmentIds phải là UUID' })
  assignmentIds!: string[];
}

/** Charity gửi yêu cầu hợp tác đến provider */
/**
 * Chi tiết "đơn xin thực phẩm" bếp gửi NCC — lưu nguyên khối vào
 * `campaign_provider_requests.demand_details` (JSONB).
 *
 * Toàn bộ field đều optional trừ `nonCommercialWaiver`: bếp phải tick cam kết dùng
 * thực phẩm cho mục đích từ thiện phi thương mại thì mới được gửi yêu cầu. Đây là
 * ràng buộc pháp lý, không phải tuỳ chọn giao diện — nên chốt ở BE, FE tick chỉ là
 * lớp nhắc lại.
 */
export class DemandDetailsDto {
  @ApiPropertyOptional({ enum: FoodCategory, example: FoodCategory.RAW_PROTEIN })
  @IsOptional()
  @IsEnum(FoodCategory, { message: 'Phân loại thực phẩm không hợp lệ' })
  foodCategory?: FoodCategory;

  @ApiPropertyOptional({ example: 'Thịt heo / Rau xanh' })
  @IsOptional()
  @IsString({ message: 'Tên nguyên liệu phải là chuỗi' })
  @MaxLength(255, { message: 'Tên nguyên liệu tối đa 255 ký tự' })
  ingredientName?: string;

  @ApiPropertyOptional({ example: 30, description: 'Số kg cần' })
  @IsOptional()
  @IsNumber({}, { message: 'Số lượng phải là số' })
  @Min(0.1, { message: 'Số lượng tối thiểu 0.1 kg' })
  @Max(10000, { message: 'Số lượng tối đa 10.000 kg' })
  @Type(() => Number)
  quantityKg?: number;

  @ApiPropertyOptional({ example: 100, description: 'Số suất ăn dự kiến nấu được' })
  @IsOptional()
  @IsInt({ message: 'Số suất dự kiến phải là số nguyên' })
  @Min(1, { message: 'Số suất dự kiến tối thiểu 1' })
  @Max(100000, { message: 'Số suất dự kiến tối đa 100.000' })
  @Type(() => Number)
  expectedServings?: number;

  @ApiPropertyOptional({ example: '2026-08-19', description: 'NGÀY cần nhận nguyên liệu tại bếp (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày cần nhận phải theo định dạng YYYY-MM-DD' })
  neededDate?: string;

  @ApiPropertyOptional({ example: '16:00', description: 'Giờ bắt đầu cần nhận tại bếp (HH:mm)' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ bắt đầu phải theo định dạng HH:mm' })
  neededFrom?: string;

  @ApiPropertyOptional({ example: '17:00', description: 'Giờ kết thúc cần nhận tại bếp (HH:mm)' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ kết thúc phải theo định dạng HH:mm' })
  neededTo?: string;

  @ApiPropertyOptional({ example: 5, description: 'Bán kính tìm NCC (km)' })
  @IsOptional()
  @IsNumber({}, { message: 'Bán kính phải là số' })
  @Min(0.5, { message: 'Bán kính tối thiểu 0.5 km' })
  @Max(50, { message: 'Bán kính tối đa 50 km' })
  @Type(() => Number)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Bắt buộc NCC có giấy chứng nhận ATVSTP' })
  @IsOptional()
  @IsBoolean({ message: 'Tiêu chí ATVSTP phải là true/false' })
  requireAtvstpCert?: boolean;

  @ApiPropertyOptional({ description: 'Bắt buộc vận chuyển chuỗi lạnh (< 5°C)' })
  @IsOptional()
  @IsBoolean({ message: 'Tiêu chí chuỗi lạnh phải là true/false' })
  requireColdChain?: boolean;

  @ApiPropertyOptional({ description: 'Bắt buộc shipper chụp ảnh QC nguyên liệu lúc nhận' })
  @IsOptional()
  @IsBoolean({ message: 'Tiêu chí ảnh QC phải là true/false' })
  requireQcPhoto?: boolean;

  @ApiProperty({ description: 'Cam kết dùng thực phẩm cho mục đích từ thiện phi thương mại' })
  @IsBoolean({ message: 'Cam kết phi thương mại phải là true/false' })
  nonCommercialWaiver!: boolean;
}

export class SendProviderRequestDto {
  @ApiProperty()
  @IsUUID('4', { message: 'ID nhà cung cấp không hợp lệ' })
  providerId!: string;

  @ApiPropertyOptional({ type: DemandDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DemandDetailsDto)
  demandDetails?: DemandDetailsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'ID chiến dịch không hợp lệ' })
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'ID thực phẩm không hợp lệ' })
  listingIds?: string[];

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

  @ApiPropertyOptional({
    example: '2026-06-21',
    description: 'Ngày kết thúc dự kiến (>= scheduledDate). Bỏ trống nếu chỉ tổ chức 1 ngày.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc phải đúng định dạng YYYY-MM-DD' })
  endDate?: string;

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

  @ApiPropertyOptional({ example: '8f4f9f23-4d0b-43e7-8d64-9a0f3d399427', description: 'Bắt buộc khi duyệt campaign có ca trực' })
  @IsOptional()
  @IsUUID('4', { message: 'Ca trực không hợp lệ' })
  shiftId?: string;
}

// ─── Manage: Tạo đợt phát suất ăn ────────────────────────────────────────────
export class ConfirmCampaignTransportReceiptDto {
  @ApiPropertyOptional({ description: 'Ghi chú khi xác nhận nhận hàng' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;

  @ApiPropertyOptional({ description: 'URL ảnh biên nhận (tùy chọn)' })
  @IsOptional()
  @IsString({ message: 'URL ảnh biên nhận phải là chuỗi' })
  @MaxLength(2000, { message: 'URL ảnh biên nhận quá dài' })
  receiptPhotoUrl?: string;
}

/** Một điểm phát trong đợt — địa chỉ để shipper điều hướng tới. */
export class DistributionPointDto {
  @ApiProperty({ example: 'Cổng trường tiểu học A' })
  @IsString({ message: 'Tên điểm phát phải là chuỗi' })
  @MinLength(1, { message: 'Tên điểm phát không được để trống' })
  @MaxLength(255, { message: 'Tên điểm phát tối đa 255 ký tự' })
  label!: string;

  @ApiProperty({ example: '12 Phan Văn Trị, Phường 7, Gò Vấp' })
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @MinLength(1, { message: 'Địa chỉ điểm phát không được để trống' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  address!: string;

  @ApiPropertyOptional({ example: 106.6297 })
  @IsOptional()
  @IsNumber({}, { message: 'Kinh độ phải là số' })
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 10.8231 })
  @IsOptional()
  @IsNumber({}, { message: 'Vĩ độ phải là số' })
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;
}

export class CreateDistributionDto {
  @ApiPropertyOptional({
    description:
      'Tình nguyện viên phụ trách đợt phát — phải là TNV ĐÃ ĐƯỢC DUYỆT của chính chiến dịch này.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Người phụ trách không hợp lệ' })
  servedByVolunteerId?: string;

  @ApiPropertyOptional({
    description:
      'Danh sách shipper được phân công đi phát đợt này. Mỗi người phải là TNV đã duyệt của '
      + 'chiến dịch VÀ có vai trò shipper. Tất cả đều nhận thông báo đi giao.',
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách người phụ trách phải là mảng' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 người phụ trách một đợt' })
  @IsUUID('4', { each: true, message: 'ID người phụ trách không hợp lệ' })
  assigneeVolunteerIds?: string[];

  @ApiPropertyOptional({ type: [DistributionPointDto], description: 'Các điểm phát của đợt' })
  @IsOptional()
  @IsArray({ message: 'Danh sách điểm phát phải là mảng' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 điểm phát một đợt' })
  @ValidateNested({ each: true })
  @Type(() => DistributionPointDto)
  points?: DistributionPointDto[];

  @ApiProperty({ example: 150, description: 'Số suất đã phát' })
  @IsInt({ message: 'Số suất phải là số nguyên' })
  @Min(1, { message: 'Số suất đã phát phải ít nhất 1' })
  @Max(100000, { message: 'Số suất tối đa 100.000' })
  @Type(() => Number)
  servingsServed!: number;

  @ApiProperty({ example: 150, description: 'Số người nhận (mỗi người ít nhất 1 suất)' })
  @IsInt({ message: 'Số người phải là số nguyên' })
  @Min(1, { message: 'Số người nhận phải ít nhất 1' })
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
export class CompleteDistributionDto {
  @ApiPropertyOptional({ example: 45, description: 'Số suất THỰC PHÁT — bỏ trống = đúng kế hoạch' })
  @IsOptional()
  @IsInt({ message: 'Số suất thực phát phải là số nguyên' })
  @Min(0, { message: 'Số suất thực phát không được âm' })
  @Max(100000)
  @Type(() => Number)
  actualServings?: number;

  @ApiPropertyOptional({ example: 45, description: 'Số người thực nhận' })
  @IsOptional()
  @IsInt({ message: 'Số người nhận phải là số nguyên' })
  @Min(0, { message: 'Số người nhận không được âm' })
  @Max(100000)
  @Type(() => Number)
  actualPeopleServed?: number;

  @ApiPropertyOptional({ description: 'Ghi chú lúc chốt đợt phát' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

/**
 * Shipper xác nhận đã LẤY nguyên liệu tại NCC cho một đơn của chiến dịch.
 * Ảnh đi kèm dạng multipart (field `photo`) nên không khai ở đây.
 */
export class ConfirmIngredientPickupDto {
  @ApiProperty({ example: 28.5, description: 'Số kg THỰC NHẬN tại nhà cung cấp' })
  @IsNumber({}, { message: 'Số kg thực nhận phải là số' })
  @Min(0, { message: 'Số kg thực nhận không được âm' })
  @Max(10000, { message: 'Số kg thực nhận tối đa 10.000' })
  @Type(() => Number)
  receivedKg!: number;

  @ApiPropertyOptional({ description: 'Ghi chú (vd: NCC chỉ còn 25kg, thiếu 5kg rau)' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

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

  // Min 1 giống ShiftInputDto lúc tạo chiến dịch: ca cần 0 người luôn được tính là
  // "đã đủ 100%", đẩy chiến dịch qua điều kiện đủ người bằng một ca ma.
  @ApiProperty({ example: 4 })
  @IsInt({ message: 'Số người cần phải là số nguyên' })
  @Min(1, { message: 'Mỗi ca phải cần ít nhất 1 người' })
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
  @Min(1, { message: 'Mỗi ca phải cần ít nhất 1 người' })
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

  // Cùng lý do với MenuItemDto.type: chuỗi tự do làm món biến mất khỏi cả 3 tab bữa ăn.
  @ApiProperty({ enum: ['breakfast', 'lunch', 'dinner'], example: 'lunch' })
  @IsIn(['breakfast', 'lunch', 'dinner'], { message: 'Bữa ăn chỉ nhận: breakfast / lunch / dinner' })
  type!: 'breakfast' | 'lunch' | 'dinner';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  @Type(() => Number)
  plannedServings?: number;
}

export class SetMenuItemMealDto {
  @ApiProperty({ example: 'lunch', enum: ['breakfast', 'lunch', 'dinner'] })
  @IsIn(['breakfast', 'lunch', 'dinner'], { message: 'Bữa phải là breakfast/lunch/dinner' })
  type!: string;
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

/**
 * Provider duyệt yêu cầu hợp tác từ charity:
 * - action='accept'  → chấp nhận, có thể chọn giờ TNV đến lấy (mặc định = campaign.startTime)
 *                       và bật cờ "cần TNV giao hàng" (mặc định = true).
 * - action='reject'  → từ chối, kèm note giải thích.
 *
 * Khi action='accept' và needsTransport=true → BE tự tạo delivery record +
 * gọi DeliveriesService.broadcastToNearbyShippers để tìm shipper gần nhất.
 */
export class ReviewProviderRequestDto {
  @ApiProperty({ enum: ['accept', 'reject'], example: 'accept' })
  @IsString()
  @IsIn(['accept', 'reject'], { message: 'action chỉ chấp nhận accept | reject' })
  action!: 'accept' | 'reject';

  @ApiPropertyOptional({ example: 'Rất tiếp, kho đang thiếu hàng.' })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;

  /** Provider chọn giờ TNV đến lấy (HH:mm). Bỏ trống = lấy theo campaign.startTime. */
  @ApiPropertyOptional({
    example: '09:00',
    description: 'Giờ TNV đến lấy hàng (HH:mm). Bỏ trống → mặc định theo campaign.',
  })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Giờ lấy phải đúng định dạng HH:mm' })
  pickupTime?: string;

  /** Có cần TNV giao hàng từ provider → kitchen không? Mặc định = true. */
  @ApiPropertyOptional({
    example: true,
    description:
      'true = BE tự tìm TNV giao hàng; false = charity tự điều phối TNV của mình đến lấy.',
  })
  @IsOptional()
  @IsBoolean({ message: 'needsTransport phải là boolean' })
  @Transform(({ value }) => (value === undefined ? true : value))
  needsTransport?: boolean;
}

/** Tổ chức mời TNV (đã khai rảnh khung này) vào một ca cụ thể. */
export class InviteVolunteersDto {
  @ApiProperty({ type: [String], description: 'Danh sách volunteerId muốn mời' })
  @IsArray({ message: 'Danh sách tình nguyện viên phải là mảng' })
  @ArrayMinSize(1, { message: 'Chọn ít nhất một tình nguyện viên để mời' })
  // Một ca thực tế chỉ cần vài người; mời hàng loạt là spam thông báo.
  @ArrayMaxSize(30, { message: 'Mỗi lần mời tối đa 30 người' })
  @IsUUID('4', { each: true, message: 'ID tình nguyện viên không hợp lệ' })
  volunteerIds!: string[];

  @ApiProperty({ example: '2026-08-27' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày trực phải theo định dạng YYYY-MM-DD' })
  workDate!: string;

  @ApiProperty({ enum: ['midnight', 'morning', 'afternoon', 'evening'] })
  @IsIn(['midnight', 'morning', 'afternoon', 'evening'], {
    message: 'Ca chỉ nhận: midnight / morning / afternoon / evening',
  })
  period!: string;

  @ApiPropertyOptional({ example: 'Bếp đang thiếu 2 đầu bếp ca sáng, mong bạn hỗ trợ.' })
  @IsOptional()
  @IsString({ message: 'Lời nhắn phải là chuỗi' })
  @MaxLength(300, { message: 'Lời nhắn tối đa 300 ký tự' })
  message?: string;
}
