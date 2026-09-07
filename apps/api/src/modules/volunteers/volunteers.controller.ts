import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VolunteersService } from './volunteers.service';
import { SetAvailabilityDto, UpdateLocationDto } from './dto/set-availability.dto';
import { SetDeliveryShiftsDto, SetWeeklyAvailabilityDto } from './dto/weekly-availability.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Volunteers')
@Controller('volunteers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VolunteersController {
  constructor(private volunteersService: VolunteersService) {}

  @Get('me')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: hồ sơ + trạng thái sẵn sàng + vị trí' })
  getMe(@CurrentUser() user: User) {
    return this.volunteersService.getMe(user.id);
  }

  @Patch('me/availability')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: bật/tắt sẵn sàng nhận đơn + cập nhật vị trí' })
  setAvailability(@CurrentUser() user: User, @Body() dto: SetAvailabilityDto) {
    return this.volunteersService.setAvailability(user.id, dto);
  }

  @Patch('me/location')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: cập nhật vị trí hiện tại (theo dõi đơn giao trực tiếp)' })
  updateLocation(@CurrentUser() user: User, @Body() dto: UpdateLocationDto) {
    return this.volunteersService.updateLocation(user.id, dto.lng, dto.lat);
  }

  @Get('me/weekly-availability')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: lịch rảnh hằng tuần đã khai (lưới 7 ngày × 4 ca)' })
  getWeeklyAvailability(@CurrentUser() user: User) {
    return this.volunteersService.getMyWeeklyAvailability(user.id);
  }

  @Get('me/delivery-shifts')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: ca giao hàng đã đăng ký + trạng thái cửa sổ đăng ký' })
  getDeliveryShifts(@CurrentUser() user: User) {
    return this.volunteersService.getMyDeliveryShifts(user.id);
  }

  @Put('me/delivery-shifts')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'Volunteer: đăng ký ca giao hàng cho tuần kế tiếp (cửa sổ mở CN 12:00 trưa, thời lượng do admin cấu hình)',
  })
  setDeliveryShifts(@CurrentUser() user: User, @Body() dto: SetDeliveryShiftsDto) {
    return this.volunteersService.setMyDeliveryShifts(user.id, dto);
  }

  @Put('me/weekly-availability')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'Volunteer: lưu lịch rảnh hằng tuần (ghi đè toàn bộ). Chỉ dùng để lọc/gợi ý ca, không tự động phân công.',
  })
  setWeeklyAvailability(@CurrentUser() user: User, @Body() dto: SetWeeklyAvailabilityDto) {
    return this.volunteersService.setMyWeeklyAvailability(user.id, dto);
  }
}
