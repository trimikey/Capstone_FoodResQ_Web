import { ArrayMaxSize, IsArray, IsIn, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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
