import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { KitchenOpsService } from './kitchen-ops.service';
import {
  AddMenuItemDto,
  CreateBeneficiaryFeedbackDto,
  CreateDistributionDto,
  CreateMealFeedbackDto,
  CreateSafetyLogDto,
  CreateShiftDto,
  ScanHandoffDto,
} from './dto/kitchen.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Campaigns · Kitchen Ops')
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KitchenOpsController {
  constructor(private kitchen: KitchenOpsService) {}

  // ── Ca làm việc ──────────────────────────────────────────────────────────────

  @Post(':id/shifts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: tạo ca làm việc cho chiến dịch' })
  createShift(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateShiftDto,
  ) {
    return this.kitchen.createShift(id, user.id, dto);
  }

  @Get(':id/shifts')
  @ApiOperation({ summary: 'Danh sách ca làm việc của chiến dịch' })
  listShifts(@Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.listShifts(id);
  }

  // ── Thực đơn (công thức) ──────────────────────────────────────────────────────

  @Post(':id/menu-items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary: 'Charity: thêm món vào thực đơn (liên kết công thức)',
  })
  addMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddMenuItemDto,
  ) {
    return this.kitchen.addMenuItem(id, user.id, dto);
  }

  @Get(':id/menu-items')
  @ApiOperation({ summary: 'Thực đơn của chiến dịch' })
  listMenuItems(@Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.listMenuItems(id);
  }

  @Delete('menu-items/:itemId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: xoá món khỏi thực đơn' })
  removeMenuItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: User,
  ) {
    return this.kitchen.removeMenuItem(itemId, user.id);
  }

  // ── Nhật ký an toàn thực phẩm (chef) ─────────────────────────────────────────

  @Post(':id/safety-logs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Đầu bếp: ghi một mục nhật ký an toàn thực phẩm (kèm ảnh)',
  })
  async createSafetyLog(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateSafetyLogDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const photoUrl = photo
      ? await this.kitchen.saveProofPhoto(photo)
      : undefined;
    return this.kitchen.createSafetyLog(id, user.id, dto, photoUrl);
  }

  @Get(':id/safety-logs')
  @ApiOperation({ summary: 'Nhật ký an toàn thực phẩm của chiến dịch' })
  listSafetyLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.listSafetyLogs(id);
  }

  // ── Phân phát suất ăn (waiter) ───────────────────────────────────────────────

  @Post(':id/distributions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Phục vụ: ghi một đợt phân phát suất ăn (kèm ảnh)' })
  async createDistribution(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateDistributionDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const photoUrl = photo
      ? await this.kitchen.saveProofPhoto(photo)
      : undefined;
    return this.kitchen.createDistribution(id, user.id, dto, photoUrl);
  }

  @Get(':id/distributions')
  @ApiOperation({ summary: 'Các đợt phân phát của chiến dịch' })
  listDistributions(@Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.listDistributions(id);
  }

  @Get(':id/distributions/summary')
  @ApiOperation({ summary: 'Tổng hợp số liệu phân phát của chiến dịch' })
  distributionSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.distributionSummary(id);
  }

  @Post('distributions/:distId/feedback')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'Phục vụ: ghi nhận phản hồi vận hành tại điểm phát (không định danh người thụ hưởng)',
  })
  addFeedback(
    @Param('distId', ParseUUIDPipe) distId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMealFeedbackDto,
  ) {
    return this.kitchen.addFeedback(distId, user.id, dto);
  }

  // ── QR nhận suất ăn + phản hồi có xác thực người thụ hưởng ───────────────────

  @Post('handoffs/qr')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary:
      'Người nhận: cấp mã QR nhận suất ăn (hiệu lực ngắn, cấp tài khoản)',
  })
  issueHandoffQr(@CurrentUser() user: User) {
    return this.kitchen.issueHandoffQr(user.id);
  }

  @Get('handoffs/mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary: 'Người nhận: các suất ăn đã nhận và trạng thái phản hồi',
  })
  listMyHandoffs(@CurrentUser() user: User) {
    return this.kitchen.listMyHandoffs(user.id);
  }

  @Post('handoffs/:handoffId/feedback')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary: 'Người nhận: gửi phản hồi (một lần) cho suất ăn đã nhận',
  })
  submitBeneficiaryFeedback(
    @Param('handoffId', ParseUUIDPipe) handoffId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateBeneficiaryFeedbackDto,
  ) {
    return this.kitchen.submitBeneficiaryFeedback(handoffId, user.id, dto);
  }

  @Post(':id/distributions/:distId/scan-handoff')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary: 'Phục vụ: quét QR người nhận để lập biên nhận suất ăn',
  })
  scanHandoff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('distId', ParseUUIDPipe) distId: string,
    @CurrentUser() user: User,
    @Body() dto: ScanHandoffDto,
  ) {
    return this.kitchen.scanHandoff(id, distId, user.id, dto.qrToken);
  }

  @Get(':id/handoffs/summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tổng hợp phản hồi có xác thực của chiến dịch (không lộ danh tính)',
  })
  beneficiaryFeedbackSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.beneficiaryFeedbackSummary(id);
  }
}
