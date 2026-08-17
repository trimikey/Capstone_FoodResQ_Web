import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, ArrayMaxSize } from 'class-validator';
import { AssignmentRole } from '@foodresq/types';

/** Ghi danh chuyên môn cho TNV (chef / waiter / shipper). */
export class UpdateSpecializationsDto {
  @ApiProperty({
    type: [String],
    enum: AssignmentRole,
    example: ['chef', 'waiter'],
    description: 'Danh sách chuyên môn muốn đăng ký. Ghi đè hoàn toàn (replace).',
  })
  @IsArray({ message: 'Chuyên môn phải là mảng' })
  @ArrayMaxSize(3, { message: 'Tối đa 3 chuyên môn' })
  @IsEnum(AssignmentRole, { each: true, message: 'Chuyên môn không hợp lệ' })
  specializations!: AssignmentRole[];
}
