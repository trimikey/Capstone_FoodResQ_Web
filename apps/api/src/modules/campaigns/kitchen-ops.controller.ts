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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KitchenOpsService } from './kitchen-ops.service';
import {
  AddMenuItemDto,
  ApplyShiftDto,
  CreateDistributionDto,
  CreateMealFeedbackDto,
  CreateSafetyLogDto,
  CreateShiftDto,
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

  @Post(':id/shifts/:shiftId/apply')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: đăng ký vào một ca làm việc' })
  applyShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @CurrentUser() user: User,
    @Body() dto: ApplyShiftDto,
  ) {
    return this.kitchen.applyToShift(id, shiftId, user.id, dto);
  }

  // ── Thực đơn (công thức) ──────────────────────────────────────────────────────

  @Post(':id/menu-items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: thêm món vào thực đơn (liên kết công thức)' })
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
  removeMenuItem(@Param('itemId', ParseUUIDPipe) itemId: string, @CurrentUser() user: User) {
    return this.kitchen.removeMenuItem(itemId, user.id);
  }

  // ── Nhật ký an toàn thực phẩm (chef) ─────────────────────────────────────────

  @Post(':id/safety-logs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Đầu bếp: ghi một mục nhật ký an toàn thực phẩm (kèm ảnh)' })
  async createSafetyLog(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateSafetyLogDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const photoUrl = photo ? await this.kitchen.saveProofPhoto(photo) : undefined;
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
    const photoUrl = photo ? await this.kitchen.saveProofPhoto(photo) : undefined;
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
  @ApiOperation({ summary: 'Gửi phản hồi của người thụ hưởng cho một đợt phân phát' })
  addFeedback(
    @Param('distId', ParseUUIDPipe) distId: string,
    @Body() dto: CreateMealFeedbackDto,
  ) {
    return this.kitchen.addFeedback(distId, dto);
  }
}
