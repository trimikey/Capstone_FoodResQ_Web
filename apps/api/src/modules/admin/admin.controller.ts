import { Body, Controller, Get, Param, Patch, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ReviewVerificationDto, ResolveReportDto, SetUserStatusDto } from './dto/admin.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Admin: số liệu tổng quan' })
  stats() {
    return this.adminService.getStats();
  }

  @Get('verifications')
  @ApiOperation({ summary: 'Admin: hồ sơ chờ duyệt' })
  verifications() {
    return this.adminService.listVerifications();
  }

  @Patch('verifications/:type/:id')
  @ApiOperation({ summary: 'Admin: duyệt/từ chối hồ sơ' })
  review(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.adminService.reviewVerification(type as 'provider' | 'volunteer', id, user.id, dto);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Admin: danh sách báo cáo' })
  reports(@Query('status') status?: string) {
    return this.adminService.listReports(status);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Admin: xử lý báo cáo' })
  resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(id, user.id, dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'Admin: danh sách người dùng' })
  users(@Query('role') role?: string, @Query('q') q?: string) {
    return this.adminService.listUsers(role, q);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Admin: đổi trạng thái (active/suspended/banned)' })
  setUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.adminService.setUserStatus(id, user.id, dto);
  }
}
