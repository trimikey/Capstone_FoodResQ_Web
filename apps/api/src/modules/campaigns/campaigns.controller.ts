import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { KitchenOpsService } from './kitchen-ops.service';
import { CreateCampaignDto, ApplyCampaignDto, CompleteCampaignDto, PledgeDonationDto, ConfirmDonationDto, AssignDonationPickupDto, AssignRequestPickupDto, SubmitCampaignChangeDto, AddExperienceDto, SendProviderRequestDto, SubmitProviderProposalDto, ReviewAssignmentDto, CreateDistributionDto, CreateShiftDto, UpdateShiftDto, AppendMenuItemDto, AppendSupplyItemDto, ReviewProviderRequestDto, ConfirmCampaignTransportReceiptDto, AdvanceCampaignTaskDto, CompleteDistributionDto, ConfirmIngredientPickupDto, SetMenuItemMealDto, ExtendRecruitmentDto, ConfirmCampaignAssignmentDto, CancelCampaignDto, InviteVolunteersDto, AcceptShiftInviteDto } from './dto/campaign.dto';
import { ApplyShiftDto } from './dto/kitchen.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ActiveAccountGuard } from '@/common/guards/active-account.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Campaigns')
@Controller('campaigns')
// ActiveAccountGuard cấp controller: MỌI thao tác ghi (POST/PATCH/DELETE) đều yêu cầu
// tài khoản đã được admin duyệt (status=active) — tổ chức từ thiện / TNV / NCC đang
// pending_verification chỉ xem được (GET), không tạo chiến dịch hay thao tác gì khác.
@UseGuards(JwtAuthGuard, ActiveAccountGuard)
@ApiBearerAuth()
export class CampaignsController {
  constructor(
    private campaignsService: CampaignsService,
    private kitchen: KitchenOpsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách chiến dịch bếp ăn đang mở' })
  listOpen() {
    return this.campaignsService.listOpen();
  }

  @Get('completed')
  @ApiOperation({ summary: 'Danh sách chiến dịch đã hoàn thành (success stories)' })
  listCompleted() {
    return this.campaignsService.listCompleted();
  }

  @Get('stats')
  @Public()
  @ApiOperation({ summary: 'Thống kê toàn hệ thống: suất ăn, người phục vụ, chiến dịch, tỉ lệ hoàn thành' })
  getStats() {
    return this.campaignsService.getSystemStats();
  }

  @Get('my-stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: thống kê workspace của tôi' })
  myStats(@CurrentUser() user: User) {
    return this.campaignsService.getMyStats(user.id);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: chiến dịch của tôi' })
  myCampaigns(@CurrentUser() user: User) {
    return this.campaignsService.myCampaigns(user.id);
  }

  @Get('my-intake-history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: lịch sử nguyên liệu đã nhận, nhóm theo từng chiến dịch' })
  myIntakeHistory(@CurrentUser() user: User) {
    return this.campaignsService.getMyIntakeHistory(user.id);
  }

  @Post(':id/accept-invite')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'Volunteer: nhận lời mời của tổ chức → vào thẳng ca (tổ chức đã chọn đích danh nên không duyệt lại)',
  })
  acceptShiftInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AcceptShiftInviteDto,
  ) {
    return this.campaignsService.acceptShiftInvite(id, user.id, dto.notificationId);
  }

  @Get('my-shift-invites')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: lời mời nhận ca đang chờ phản hồi' })
  myShiftInvites(@CurrentUser() user: User) {
    return this.campaignsService.getMyShiftInvites(user.id);
  }

  @Get('my-tasks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: việc bếp ăn đã đăng ký' })
  myTasks(@CurrentUser() user: User) {
    return this.campaignsService.myAssignments(user.id);
  }

  @Get('my-tasks/:assignmentId')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary:
      'Volunteer: chi tiết 1 nhiệm vụ — gồm ca, chiến dịch, danh sách món + 4 khâu + trạng thái hiệu lực.',
  })
  myTaskDetail(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: User,
  ) {
    return this.campaignsService.getMyTaskDetail(assignmentId, user.id);
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Công khai: chiến dịch sắp diễn ra (cho trang chủ)' })
  listPublicUpcoming() {
    return this.campaignsService.listPublicUpcoming();
  }

  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: 'Công khai: chi tiết chiến dịch (cho trang chi tiết)' })
  publicDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getPublicDetail(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: tạo chiến dịch bếp ăn' })
  create(@CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(user.id, dto);
  }

  @Post('upload-image')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Charity: upload ảnh chiến dịch → trả về URL' })
  async uploadImage(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('Thiếu file ảnh.');
    const url = await this.campaignsService.saveCampaignImage(image);
    return { url };
  }

  @Post(':id/assignments')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: gửi đăng ký tham gia một vai trò (chờ charity duyệt)' })
  createAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ApplyCampaignDto,
  ) {
    return this.campaignsService.apply(id, user.id, dto);
  }

  @Post(':id/apply')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: alias tương thích cho đăng ký tham gia một vai trò' })
  apply(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ApplyCampaignDto,
  ) {
    return this.campaignsService.apply(id, user.id, dto);
  }

  @Post(':id/shifts/:shiftId/apply')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: alias tương thích để đăng ký ca (chờ charity duyệt)' })
  async applyToShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @CurrentUser() user: User,
    @Body() dto: ApplyShiftDto,
  ) {
    const application = await this.kitchen.resolveShiftApplication(id, shiftId, dto);
    return this.campaignsService.apply(id, user.id, application);
  }

  @Patch(':id/start')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: bắt đầu chiến dịch (open → in_progress)' })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.startCampaign(id, user.id);
  }

  @Get(':id/available-volunteers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary:
      'Charity: TNV đã khai rảnh đúng ca/ngày này (gợi ý để mời khi ca thiếu người — không phải người đã nhận việc)',
  })
  availableVolunteers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('workDate') workDate: string,
    @Query('period') period: string,
    @Query('role') role?: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate ?? '')) {
      throw new BadRequestException('workDate phải theo định dạng YYYY-MM-DD.');
    }
    if (!['midnight', 'morning', 'afternoon', 'evening'].includes(period ?? '')) {
      throw new BadRequestException('period chỉ nhận: midnight / morning / afternoon / evening.');
    }
    if (role && !['chef', 'waiter', 'shipper'].includes(role)) {
      throw new BadRequestException('role chỉ nhận: chef / waiter / shipper.');
    }
    return this.campaignsService.getAvailableVolunteersForShift(id, user.id, workDate, period, role);
  }

  @Post(':id/invite-volunteers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary:
      'Charity: gửi lời mời tới TNV đã khai rảnh ca này (chỉ là thông báo — TNV vẫn tự đăng ký, tổ chức vẫn duyệt)',
  })
  inviteVolunteers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: InviteVolunteersDto,
  ) {
    return this.campaignsService.inviteVolunteersToShift(id, user.id, dto);
  }

  @Get(':id/staffing-readiness')
  @ApiOperation({ summary: 'Ma trận đủ người theo từng ngày, ca và vai trò' })
  staffingReadiness(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getStaffingReadiness(id);
  }

  @Patch(':id/recruitment/extend')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: gia hạn tuyển trong giới hạn khoảng đệm' })
  extendRecruitment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ExtendRecruitmentDto,
  ) {
    return this.campaignsService.extendRecruitment(id, user.id, dto.recruitmentEndAt);
  }

  @Patch('assignments/:assignmentId/confirmation')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: xác nhận hoặc từ chối ca đã được tổ chức duyệt' })
  confirmAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: User,
    @Body() dto: ConfirmCampaignAssignmentDto,
  ) {
    return this.campaignsService.confirmAssignment(assignmentId, user.id, dto.decision);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: huỷ kế hoạch trước hoặc trong giai đoạn tuyển (kèm lý do gửi TNV/NCC)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CancelCampaignDto,
  ) {
    return this.campaignsService.cancelCampaign(id, user.id, dto.reason);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary:
      'Charity: kết thúc chiến dịch + nhập số suất thực tế. Nếu chưa tới ngày kết thúc cần gửi earlyEndConfirmation + earlyEndReason.',
  })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CompleteCampaignDto,
  ) {
    return this.campaignsService.completeCampaign(
      id,
      user.id,
      dto.actualServings,
      {
        earlyEndConfirmation: dto.earlyEndConfirmation,
        earlyEndReason: dto.earlyEndReason,
      },
    );
  }

  @Post(':id/change-requests')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: gửi yêu cầu thay đổi chiến dịch (chờ admin duyệt)' })
  submitChange(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitCampaignChangeDto,
  ) {
    return this.campaignsService.submitChangeRequest(id, user.id, dto);
  }

  @Get(':id/change-requests')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: lịch sử yêu cầu thay đổi của chiến dịch' })
  listChanges(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.listChangeRequests(id, user.id);
  }

  @Patch('change-requests/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: huỷ yêu cầu thay đổi đang chờ duyệt' })
  cancelChange(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.cancelChangeRequest(id, user.id);
  }

  @Post('experiences/upload-image')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Volunteer: upload ảnh cảm nhận → trả về URL' })
  async uploadExperienceImage(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('Thiếu file ảnh.');
    const url = await this.campaignsService.saveExperienceImage(image);
    return { url };
  }

  @Post(':id/experiences')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: chia sẻ cảm nhận sau khi chiến dịch hoàn tất' })
  addExperience(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddExperienceDto,
  ) {
    return this.campaignsService.addExperience(id, user.id, dto);
  }

  @Post(':id/donations')
  @UseGuards(RolesGuard, ActiveAccountGuard)
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: quyên góp nguyên liệu cho chiến dịch' })
  pledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: PledgeDonationDto,
  ) {
    return this.campaignsService.pledgeDonation(id, user.id, dto);
  }

  @Patch('donations/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: xác nhận đã nhận nguyên liệu quyên góp' })
  confirmDonation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User, @Body() dto: ConfirmDonationDto) {
    return this.campaignsService.confirmDonation(id, user.id, dto);
  }

  @Patch('donations/:id/assign-pickup')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary: 'Charity: phân công TNV đi nhận quyên góp — khung giờ phải nằm trong ca trực của TNV',
  })
  assignDonationPickup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AssignDonationPickupDto,
  ) {
    return this.campaignsService.assignDonationPickup(id, user.id, dto);
  }

  @Patch('requests/:id/assign-pickup')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary: 'Charity: phân công shipper chiến dịch đi nhận đơn nguyên liệu NCC (thay vòng tìm shipper hệ thống)',
  })
  assignRequestPickup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AssignRequestPickupDto,
  ) {
    return this.campaignsService.assignRequestPickup(id, user.id, dto);
  }

  @Post('assignments/:id/advance')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Volunteer: chuyển bước công việc (điểm danh → làm → hoàn thành) + ảnh minh chứng' })
  async advance(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AdvanceCampaignTaskDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const proofUrl = photo ? await this.campaignsService.saveProofPhoto(photo) : undefined;
    return this.campaignsService.advanceTask(id, user.id, dto, proofUrl);
  }

  @Get('create-constraints')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary: 'Charity: các ràng buộc form tạo chiến dịch (báo trước dài ngày, tỉ lệ tuyển tối thiểu…)',
  })
  createConstraints() {
    return this.campaignsService.getCreateConstraints();
  }

  @Get('my-pickup-orders')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({
    summary: 'Shipper: đơn nguyên liệu cần đi lấy, gom từ mọi chiến dịch đang chạy',
  })
  myPickupOrders(@CurrentUser() user: User) {
    return this.campaignsService.myPickupOrders(user.id);
  }

  @Get('my-pickup-history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: lịch sử các đơn nguyên liệu đã lấy' })
  myPickupHistory(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campaignsService.myPickupHistory(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('pickup-orders/:requestId/confirm')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Shipper: xác nhận đã lấy nguyên liệu tại NCC — ảnh + số kg thực nhận',
  })
  async confirmIngredientPickup(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: User,
    @Body() dto: ConfirmIngredientPickupDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const photoUrl = photo ? await this.campaignsService.saveProofPhoto(photo) : undefined;
    return this.campaignsService.confirmIngredientPickup(requestId, user.id, dto, photoUrl);
  }

  @Post('requests')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: gửi yêu cầu hợp tác đến provider' })
  sendProviderRequest(@CurrentUser() user: User, @Body() dto: SendProviderRequestDto) {
    return this.campaignsService.sendProviderRequest(user.id, dto);
  }

  @Post('distributions/:distributionId/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VOLUNTEER, UserRole.RECEIVER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Shipper được phân công (hoặc tổ chức chủ chiến dịch) xác nhận đã phát xong một đợt',
  })
  async completeDistribution(
    @CurrentUser() user: User,
    @Param('distributionId', ParseUUIDPipe) distributionId: string,
    @Body() dto: CompleteDistributionDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const proofUrl = photo ? await this.campaignsService.saveProofPhoto(photo) : undefined;
    return this.campaignsService.completeDistribution(distributionId, user.id, dto, proofUrl);
  }

  @Get('my-distributions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: lịch sử các đợt phát đã đi' })
  myDistributionHistory(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campaignsService.myDistributionHistory(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/supplier-matches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary:
      'Charity: gợi ý NCC phù hợp cho chiến dịch — xếp theo khoảng cách thật từ bếp (PostGIS)',
  })
  suggestSuppliers(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('category') category?: string,
  ) {
    const parsed = radiusKm != null ? Number(radiusKm) : undefined;
    return this.campaignsService.suggestSuppliersForCampaign(id, user.id, {
      radiusKm: Number.isFinite(parsed) ? parsed : undefined,
      category: category || undefined,
    });
  }

  @Get('provider-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: xem danh sách request nhận được từ charity' })
  listMyProviderRequests(@CurrentUser() user: User) {
    return this.campaignsService.listMyProviderRequests(user.id);
  }

  @Get('my-sent-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: xem danh sách request đã gửi đến provider' })
  listMySentRequests(@CurrentUser() user: User) {
    return this.campaignsService.listMySentRequests(user.id);
  }

  @Patch('provider-requests/:requestId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: chấp nhận hoặc từ chối request từ charity' })
  reviewProviderRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: ReviewProviderRequestDto,
  ) {
    return this.campaignsService.reviewProviderRequest(
      user.id,
      requestId,
      body.action,
      body.note,
      { pickupTime: body.pickupTime, needsTransport: body.needsTransport },
    );
  }

  @Post('provider-proposals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({
    summary:
      'Charity: đề xuất thêm/gia hạn NCC mới khi hệ thống chưa có provider nào — admin duyệt sau.',
  })
  submitProviderProposal(@CurrentUser() user: User, @Body() dto: SubmitProviderProposalDto) {
    return this.campaignsService.submitProviderProposal(user.id, dto);
  }

  @Post(':id/transports/:transportId/receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: xác nhận đã nhận thực phẩm từ shipper' })
  receiveTransport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transportId', ParseUUIDPipe) transportId: string,
    @CurrentUser() user: User,
    @Body() dto: ConfirmCampaignTransportReceiptDto,
  ) {
    return this.campaignsService.confirmTransportReceipt(id, transportId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết chiến dịch' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.findOne(id);
  }

  // ─── Manage endpoints (trang /campaigns/[id]/manage/*) ─────────────────────

  @Get(':id/manage-detail')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: chi tiết chiến dịch cho trang quản lý (bao gồm pending assignments)' })
  getManageDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.getManageDetail(id, user.id);
  }

  @Patch(':id/assignments/:assignmentId/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: duyệt / từ chối 1 đăng ký TNV (chỉ khi status=pending)' })
  reviewAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewAssignmentDto,
  ) {
    return this.campaignsService.reviewAssignment(id, assignmentId, user.id, dto);
  }

  @Post(':id/manage/distributions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: ghi nhận 1 đợt phát suất ăn (in_progress/completed)' })
  createDistribution(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateDistributionDto,
  ) {
    return this.campaignsService.createDistribution(id, user.id, dto);
  }

  @Post(':id/manage/shifts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: thêm ca trực cho chiến dịch' })
  addShift(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateShiftDto,
  ) {
    return this.campaignsService.addShift(id, user.id, dto);
  }

  @Put(':id/shifts/:shiftId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: sửa ca trực' })
  updateShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.campaignsService.updateShift(id, shiftId, user.id, dto);
  }

  @Delete(':id/shifts/:shiftId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: xoá ca trực (chỉ khi chưa có TNV đăng ký)' })
  deleteShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @CurrentUser() user: User,
  ) {
    return this.campaignsService.deleteShift(id, shiftId, user.id);
  }

  @Post(':id/manage/menu-items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: thêm món vào thực đơn chiến dịch' })
  appendMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AppendMenuItemDto,
  ) {
    return this.campaignsService.appendMenuItem(id, user.id, dto);
  }

  @Patch(':id/manage/menu-items/:index/meal')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: gán bữa (sáng/trưa/tối) cho một món trong thực đơn' })
  setMenuItemMeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index') index: string,
    @CurrentUser() user: User,
    @Body() dto: SetMenuItemMealDto,
  ) {
    return this.campaignsService.setMenuItemMeal(id, user.id, Number(index), dto.type);
  }

  @Post(':id/supply-items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: thêm vật phẩm vào danh sách cần chuẩn bị' })
  appendSupplyItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AppendSupplyItemDto,
  ) {
    return this.campaignsService.appendSupplyItem(id, user.id, dto);
  }

  // ── Tổ chức duyệt món QC ────────────────────────────────────────────────

  @Post(':id/dishes/:menuItemId/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: duyệt bước "Sẵn sàng phát xuất" của một món — món đã được chef tick xong' })
  approveDishFinalStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('menuItemId') menuItemId: string,
    @CurrentUser() user: User,
  ) {
    return this.campaignsService.approveDishFinalStep(id, user.id, menuItemId);
  }

  @Post(':id/dishes/:menuItemId/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức: từ chối bước "Sẵn sàng phát xuất" của một món — chef phải làm lại' })
  rejectDishFinalStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('menuItemId') menuItemId: string,
    @CurrentUser() user: User,
    @Body() body: { reason: string },
  ) {
    return this.campaignsService.rejectDishFinalStep(id, user.id, menuItemId, body.reason);
  }
}
