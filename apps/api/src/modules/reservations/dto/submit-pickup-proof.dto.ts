import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PickupVerificationType } from '@foodresq/types';

export class SubmitPickupProofDto {
  @ApiProperty({
    enum: PickupVerificationType,
    description: 'Loại ảnh xác minh: khuôn mặt (face) hoặc căn cước công dân (id_card)',
  })
  @IsEnum(PickupVerificationType)
  verificationType!: PickupVerificationType;
}
