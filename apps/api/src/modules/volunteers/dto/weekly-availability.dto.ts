import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const SHIFT_PERIOD_VALUES = ['midnight', 'morning', 'afternoon', 'evening'] as const;
export type ShiftPeriodValue = (typeof SHIFT_PERIOD_VALUES)[number];

/** Một ô trong lưới 7 ngày × 4 ca. */
export class AvailabilitySlotDto {
  @ApiProperty({ example: 1, description: '1 = Thứ 2 … 7 = Chủ nhật (ISO-8601)' })
  @IsInt({ message: 'Thứ trong tuần phải là số nguyên' })
  @Min(1, { message: 'Thứ trong tuần từ 1 (Thứ 2) đến 7 (Chủ nhật)' })
  @Max(7, { message: 'Thứ trong tuần từ 1 (Thứ 2) đến 7 (Chủ nhật)' })
  @Type(() => Number)
  dayOfWeek!: number;

  @ApiProperty({ enum: SHIFT_PERIOD_VALUES, example: 'morning' })
  @IsIn(SHIFT_PERIOD_VALUES, { message: 'Ca chỉ nhận: midnight / morning / afternoon / evening' })
  period!: ShiftPeriodValue;
}

export class SetWeeklyAvailabilityDto {
  @ApiProperty({
    type: [AvailabilitySlotDto],
    description:
      'Toàn bộ khung giờ rảnh sau khi chỉnh (ghi đè hoàn toàn lịch cũ). Gửi mảng rỗng = xoá hết.',
  })
  @IsArray({ message: 'Lịch rảnh phải là mảng' })
  // Lưới chỉ có 28 ô nên nhiều hơn 28 chắc chắn là dữ liệu hỏng hoặc bị nhân bản.
  @ArrayMaxSize(28, { message: 'Lịch rảnh tối đa 28 khung (7 ngày × 4 ca)' })
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}

/** Một ca giao hàng cho NGÀY cụ thể (khác AvailabilitySlotDto vốn theo thứ trong tuần). */
export class DeliveryShiftSlotDto {
  @ApiProperty({ example: '2026-08-24', description: 'Ngày trực (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày trực phải theo định dạng YYYY-MM-DD' })
  workDate!: string;

  @ApiProperty({ enum: SHIFT_PERIOD_VALUES, example: 'afternoon' })
  @IsIn(SHIFT_PERIOD_VALUES, { message: 'Ca chỉ nhận: midnight / morning / afternoon / evening' })
  period!: ShiftPeriodValue;
}

export class SetDeliveryShiftsDto {
  @ApiProperty({
    type: [DeliveryShiftSlotDto],
    description: 'Toàn bộ ca giao hàng trong TUẦN ĐANG SỬA (ghi đè). Mảng rỗng = bỏ hết ca tuần đó.',
  })
  @IsArray({ message: 'Danh sách ca phải là mảng' })
  @ArrayMaxSize(28, { message: 'Tối đa 28 ca (7 ngày × 4 ca)' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryShiftSlotDto)
  slots!: DeliveryShiftSlotDto[];

  // Phạm vi mà `slots` đại diện. Bắt buộc khi lưới chỉ hiển thị MỘT tuần trong khoảng
  // được phép sửa: không có nó, server ghi đè cả khoảng và cuốn luôn ca của những tuần
  // người dùng không hề nhìn thấy. Bỏ trống = ghi đè toàn bộ khoảng được phép.
  @ApiPropertyOptional({ example: '2026-08-24', description: 'Ngày đầu của tuần đang sửa' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải theo định dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-30', description: 'Ngày cuối của tuần đang sửa' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải theo định dạng YYYY-MM-DD' })
  to?: string;
}
