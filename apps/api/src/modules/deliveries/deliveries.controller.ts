import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { UpdateDeliveryStatusDto, RejectOfferDto } from './dto/update-delivery-status.dto';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Deliveries')
@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Get('my/active')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Get active delivery task' })
  getMyActive(@CurrentUser() user: User) {
    return this.deliveriesService.getMyActiveDelivery(user.id);
  }

  @Get('my/offers')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Get pending task offers' })
  getMyOffers(@CurrentUser() user: User) {
    return this.deliveriesService.getMyPendingOffers(user.id);
  }

  @Get('track/:reservationId')
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: theo dõi đơn giao (trạng thái + vị trí shipper)' })
  track(@Param('reservationId', ParseUUIDPipe) reservationId: string, @CurrentUser() user: User) {
    return this.deliveriesService.getTrackingForReceiver(reservationId, user.id);
  }

  @Get('my/stats')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Bảng thành tích (số đơn, km, tỉ lệ hoàn thành, ★)' })
  getMyStats(@CurrentUser() user: User) {
    return this.deliveriesService.getMyStats(user.id);
  }

  @Get('my/history')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Lịch sử giao hàng (đã giao / thất bại), phân trang' })
  getMyHistory(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.deliveriesService.getMyDeliveryHistory(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/accept')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Accept a delivery offer' })
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.deliveriesService.acceptOffer(id, user.id);
  }

  @Post(':id/reject')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Reject a delivery offer' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectOfferDto,
  ) {
    return this.deliveriesService.rejectOffer(id, user.id, dto.reason);
  }

  @Post(':id/cancel')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Huỷ nhận đơn (chỉ trước khi lấy hàng) → trả về chờ nhận' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectOfferDto,
  ) {
    return this.deliveriesService.cancelAssignment(id, user.id, dto.reason);
  }

  @Post(':id/fail')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Báo giao thất bại (sau khi đã lấy hàng), kèm lý do' })
  fail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectOfferDto,
  ) {
    return this.deliveriesService.failDelivery(id, user.id, dto.reason);
  }

  @Patch(':id/status')
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Shipper: Advance delivery status (kèm ảnh proof tùy chọn)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string' },
        photo: { type: 'string', format: 'binary' },
        qrToken: { type: 'string', description: 'Mã QR của người nhận (bắt buộc khi status=delivered)' },
      },
    },
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateDeliveryStatusDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_PROOF_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    photo?: Express.Multer.File,
  ) {
    const proofUrl = photo
      ? await this.deliveriesService.saveProofPhoto(photo)
      : dto.proofUrl;
    return this.deliveriesService.updateStatus(id, user.id, dto.status, proofUrl, dto.qrToken);
  }
}
