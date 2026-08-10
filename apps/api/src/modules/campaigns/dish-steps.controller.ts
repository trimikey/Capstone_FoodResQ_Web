import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ActiveAccountGuard } from '@/common/guards/active-account.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { User } from '@prisma/client';
import { UserRole } from '@foodresq/types';
import { DishStepsService } from './dish-steps.service';

/** Body khi bếp trưởng thiết lập 4 giờ dự kiến cho 1 món. */
class SetStepTimesDto {
  @IsArray()
  @ArrayMaxSize(4, { message: 'Cần đúng 4 giờ cho 4 khâu' })
  @IsString({ each: true })
  @Matches(/^\d{2}:\d{2}$/, { each: true, message: 'Giờ phải đúng định dạng HH:mm' })
  @Type(() => String)
  scheduledTimes!: string[];
}

/** Body khi QC step bị đánh dấu fail (ngắt khẩn cấp). */
class FlagStepFailureDto {
  @IsString()
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  @IsOptional()
  reason?: string;
}

@ApiTags('Campaign Dish Steps')
@Controller('campaigns/:campaignId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DishStepsController {
  constructor(private readonly service: DishStepsService) {}

  /** Tổ chức: thiết lập / cập nhật giờ 4 khâu cho 1 món. */
  @Post('menu-items/:menuItemId/step-times')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Bếp trưởng: thiết lập giờ 4 khâu (Sơ chế, Nấu, Trình bày, Sẵn sàng)' })
  setStepTimes(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @CurrentUser() user: User,
    @Body() dto: SetStepTimesDto,
  ) {
    return this.service.setScheduledTimes(campaignId, user.id, menuItemId, dto.scheduledTimes);
  }

  /** Public (trong campaign): xem danh sách món + 4 step + trạng thái. */
  @Get('dish-steps')
  @ApiOperation({ summary: 'Danh sách món + 4 khâu + trạng thái hiệu lực' })
  listSteps(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.service.getStepsForCampaign(campaignId);
  }

  /** TNV (chef/waiter) tick "xong" 1 khâu — bắt buộc ảnh bằng chứng. */
  @Post('dish-steps/:stepId/complete')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('proof'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'TNV tick hoàn thành 1 khâu (kèm ảnh bằng chứng BẮT BUỘC). ' +
      'BE kiểm tra: khâu phải available (đến giờ + khâu trước done).',
  })
  completeStep(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: User,
    @UploadedFile() proof?: Express.Multer.File,
    @Body('note') note?: string,
  ) {
    return this.service.completeStep(campaignId, user.id, stepId, proof, note);
  }

  /**
   * Chef/waiter: đánh dấu 1 khâu QC fail (ngắt khẩn cấp).
   * - Set qcFailedAt + lý do trên step.
   * - Gửi thông báo khẩn cho charity owner (real-time + lưu DB).
   * - Không ảnh hưởng các khâu / món khác.
   */
  @Post('dish-steps/:stepId/qc-fail')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'QC fail / ngắt khẩn cấp: gắn cờ qcFailed lên step + notify charity owner.',
  })
  flagStepFailure(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: User,
    @Body() dto: FlagStepFailureDto,
  ) {
    return this.service.flagStepQualityFail(
      campaignId,
      user.id,
      stepId,
      dto.reason ?? '',
    );
  }

  /** Chef/waiter (vai trò bất kỳ trong campaign): xem nguyên liệu đang có. */
  @Get('supplies')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'Danh sách thực phẩm đã nhận cho campaign (từ CampaignDonation status=received).',
  })
  listSupplies(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.service.getCampaignSupplies(campaignId);
  }
}