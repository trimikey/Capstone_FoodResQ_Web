import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DishStepsService } from './dish-steps.service';

@ApiTags('Campaign Schedule')
@Controller('campaigns/schedule')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WeeklyScheduleController {
  constructor(private readonly service: DishStepsService) {}

  /**
   * Trả lịch tuần dạng grid: 7 ngày × danh sách khâu.
   * - Volunteer: chỉ trả campaigns MÀ USER ĐƯỢC ASSIGN (kèm thông tin ca).
   * - Tổ chức: trả tất cả campaigns của tổ chức.
   * @param weekStart YYYY-MM-DD (mặc định = tuần hiện tại, bắt đầu Thứ 2 UTC).
   */
  @Get('weekly')
  @ApiOperation({ summary: 'Lịch tuần cá nhân (TNV) hoặc tổ chức' })
  async weekly(
    @CurrentUser() user: User,
    @Query('weekStart') weekStart?: string,
  ) {
    const start = weekStart ? new Date(`${weekStart}T00:00:00.000Z`) : currentWeekStartUtc();
    return this.service.getWeeklySchedule(start, user.id, user.role);
  }
}

/** Tuần hiện tại bắt đầu từ Thứ 2 (UTC). */
function currentWeekStartUtc(): Date {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=CN, 1=T2, ...
  const diffToMonday = (dow + 6) % 7; // số ngày cần lùi để về T2
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  return monday;
}