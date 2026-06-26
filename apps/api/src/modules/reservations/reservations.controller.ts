import {
  Controller,
  Get,
  Post,
  Patch,
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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ScanQrDto } from './dto/scan-qr.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { SubmitPickupProofDto } from './dto/submit-pickup-proof.dto';
import { RateReservationDto } from './dto/rate-reservation.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

const MAX_PROOF_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

@ApiTags('Reservations')
@Controller('reservations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: Reserve a food listing' })
  create(@CurrentUser() user: User, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user.id, dto);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: Get my reservations' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  myReservations(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reservationsService.findMyReservations(user.id, page, limit);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: Get a single reservation by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.reservationsService.findOne(id, user.id);
  }

  @Get('provider/my')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: Danh sách đơn đặt vào các tin của mình (lọc trạng thái)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  providerReservations(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reservationsService.findProviderReservations(user.id, status, page, limit);
  }

  @Post('scan')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Provider/Volunteer: Quét QR → picked_up + trả thông tin người nhận để đối chiếu' })
  scanQr(@Body() dto: ScanQrDto, @CurrentUser() user: User) {
    return this.reservationsService.scanQr(dto.qrToken, user.id);
  }

  @Post(':id/confirm-pickup')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Provider: Xác nhận đã giao đúng người (đối chiếu ảnh) → completed' })
  confirmPickup(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.reservationsService.confirmPickupByProvider(id, user.id);
  }

  @Post(':id/pickup-proof')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Receiver: Chụp ảnh khuôn mặt hoặc CCCD để xác minh nhận hàng (picked_up → completed)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo', 'verificationType'],
      properties: {
        photo: { type: 'string', format: 'binary' },
        verificationType: { type: 'string', enum: ['face', 'id_card'] },
      },
    },
  })
  submitPickupProof(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitPickupProofDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_PROOF_PHOTO_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    photo: Express.Multer.File,
  ) {
    return this.reservationsService.submitPickupProof(id, user.id, dto.verificationType, photo);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: Cancel a confirmed reservation' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CancelReservationDto,
  ) {
    return this.reservationsService.cancel(id, user.id, dto.reason);
  }

  @Post(':id/rating')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: Đánh giá nhà cung cấp sau khi nhận hàng' })
  rate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RateReservationDto,
  ) {
    return this.reservationsService.rateReservation(id, user.id, dto.score, dto.comment);
  }
}
