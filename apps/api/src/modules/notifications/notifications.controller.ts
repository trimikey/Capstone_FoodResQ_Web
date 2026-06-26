import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@prisma/client';

class DeviceTokenDto {
  @ApiProperty() @IsString() @MaxLength(4096) token!: string;
  @ApiPropertyOptional({ example: 'web' }) @IsOptional() @IsString() @MaxLength(20) platform?: string;
}

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  @Post('device-token')
  @ApiOperation({ summary: 'Đăng ký device token (FCM) để nhận push' })
  registerDeviceToken(@CurrentUser() user: User, @Body() dto: DeviceTokenDto) {
    return this.push.registerToken(user.id, dto.token, dto.platform);
  }

  @Delete('device-token')
  @ApiOperation({ summary: 'Xoá device token (khi đăng xuất / tắt push)' })
  removeDeviceToken(@Body() dto: DeviceTokenDto) {
    return this.push.removeToken(dto.token);
  }

  @Get('my')
  @ApiOperation({ summary: 'Danh sách thông báo của tôi' })
  myNotifications(@CurrentUser() user: User) {
    return this.notifications.listMine(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc' })
  unreadCount(@CurrentUser() user: User) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu đã đọc một thông báo' })
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.notifications.markRead(id, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu đã đọc tất cả' })
  markAllRead(@CurrentUser() user: User) {
    return this.notifications.markAllRead(user.id);
  }
}
