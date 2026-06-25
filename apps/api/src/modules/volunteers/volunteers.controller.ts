import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VolunteersService } from './volunteers.service';
import { SetAvailabilityDto, UpdateLocationDto } from './dto/set-availability.dto';
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
}
