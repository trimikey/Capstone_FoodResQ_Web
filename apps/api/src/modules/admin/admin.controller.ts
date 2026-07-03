import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  ReviewVerificationDto,
  ResolveReportDto,
  SetUserStatusDto,
  SetConfigDto,
  SetCampaignStatusDto,
  AdminCreateCampaignDto,
  AdminUpdateCampaignDto,
  AssignVolunteerDto,
  AdminCreateUserDto,
  ReviewCampaignChangeDto,
  ReviewAssignmentDto,
  UpdateListingCategoryDto,
} from './dto/admin.dto';
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

  @Get('overview')
  @ApiOperation({ summary: 'Admin: tổng quan dashboard (kg, CO2, danh mục, xu hướng, quyên góp)' })
  overview() {
    return this.adminService.getOverview();
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

  @Post('users')
  @ApiOperation({ summary: 'Admin: tạo tài khoản mới' })
  createUser(@Body() dto: AdminCreateUserDto) {
    return this.adminService.adminCreateUser(dto);
  }

  @Get('frequent-cancellers')
  @ApiOperation({ summary: 'Admin: người dùng hay huỷ / không đến' })
  frequentCancellers() {
    return this.adminService.listFrequentCancellers();
  }

  @Get('recent-reservations')
  @ApiOperation({ summary: 'Admin: đơn nhận gần đây' })
  recentReservations(@Query('limit') limit?: number) {
    return this.adminService.listRecentReservations(limit ? Number(limit) : 10);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Admin: tất cả chiến dịch bếp ăn' })
  campaigns(@Query('status') status?: string) {
    return this.adminService.listCampaigns(status);
  }

  @Get('charities')
  @ApiOperation({ summary: 'Admin: danh sách tổ chức/người nhận (chọn chủ chiến dịch)' })
  charities() {
    return this.adminService.listCharities();
  }

  @Get('volunteers')
  @ApiOperation({ summary: 'Admin: danh sách TNV để gán (lọc theo role)' })
  volunteers(@Query('role') role?: string) {
    return this.adminService.listVolunteersForAssign(role);
  }

  @Get('volunteers/manage')
  @ApiOperation({ summary: 'Admin: danh sách TNV đầy đủ để quản lý' })
  volunteersManage() {
    return this.adminService.listVolunteersDetailed();
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Admin: tạo chiến dịch' })
  createCampaign(@Body() dto: AdminCreateCampaignDto) {
    return this.adminService.adminCreateCampaign(dto);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Admin: chi tiết chiến dịch + danh sách TNV' })
  campaignDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getCampaignDetail(id);
  }

  @Patch('campaigns/:id')
  @ApiOperation({ summary: 'Admin: sửa chiến dịch' })
  updateCampaign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateCampaignDto) {
    return this.adminService.adminUpdateCampaign(id, dto);
  }

  @Patch('campaigns/:id/status')
  @ApiOperation({ summary: 'Admin: đổi trạng thái chiến dịch' })
  setCampaignStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SetCampaignStatusDto,
  ) {
    return this.adminService.setCampaignStatus(id, dto.status, user.id);
  }

  @Post('campaigns/:id/assign')
  @ApiOperation({ summary: 'Admin: gán TNV vào chiến dịch' })
  assignVolunteer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignVolunteerDto) {
    return this.adminService.adminAssignVolunteer(id, dto.volunteerId, dto.role, dto.override ?? false);
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Admin: gỡ phân công TNV' })
  unassignVolunteer(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.adminUnassignVolunteer(id);
  }

  @Get('campaign-assignments/pending')
  @ApiOperation({ summary: 'Admin: danh sách đăng ký TNV chờ duyệt' })
  pendingAssignments() {
    return this.adminService.listPendingAssignments();
  }

  @Patch('campaign-assignments/:id/review')
  @ApiOperation({ summary: 'Admin: duyệt/từ chối đăng ký TNV' })
  reviewAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewAssignmentDto,
  ) {
    return this.adminService.reviewAssignment(id, dto.decision, user.id, dto.note);
  }

  @Get('food-listings')
  @ApiOperation({ summary: 'Admin: danh sách tin thực phẩm (lọc ?group&category&status&search, phân trang)' })
  foodListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('group') group?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listFoodListings({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status, category, group, search,
    });
  }

  @Patch('food-listings/:id/category')
  @ApiOperation({ summary: 'Admin: đổi phân loại của một tin thực phẩm' })
  updateListingCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateListingCategoryDto) {
    return this.adminService.updateListingCategory(id, dto.category);
  }

  @Get('campaign-change-requests')
  @ApiOperation({ summary: 'Admin: danh sách yêu cầu thay đổi chiến dịch (?status=pending)' })
  campaignChangeRequests(@Query('status') status?: string) {
    return this.adminService.listCampaignChangeRequests(status);
  }

  @Patch('campaign-change-requests/:id')
  @ApiOperation({ summary: 'Admin: duyệt/từ chối yêu cầu thay đổi chiến dịch' })
  reviewCampaignChange(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewCampaignChangeDto,
  ) {
    return this.adminService.reviewCampaignChangeRequest(id, dto.decision, dto.reviewNote, user.id);
  }

  @Get('configs')
  @ApiOperation({ summary: 'Admin: cấu hình hệ thống' })
  configs() {
    return this.adminService.getConfigs();
  }

  @Patch('configs/:key')
  @ApiOperation({ summary: 'Admin: cập nhật một cấu hình hệ thống' })
  setConfig(@Param('key') key: string, @Body() dto: SetConfigDto, @CurrentUser() user: User) {
    return this.adminService.setConfig(key, dto.value, user.id);
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
