import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, ApplyCampaignDto, CompleteCampaignDto, PledgeDonationDto, SubmitCampaignChangeDto, AddExperienceDto, SendProviderRequestDto, SubmitProviderProposalDto, ReviewAssignmentDto, CreateDistributionDto, CreateShiftDto, UpdateShiftDto, AppendMenuItemDto, AppendSupplyItemDto, ReviewProviderRequestDto } from './dto/campaign.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Campaigns')
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

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

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: chiến dịch của tôi' })
  myCampaigns(@CurrentUser() user: User) {
    return this.campaignsService.myCampaigns(user.id);
  }

  @Get('my-tasks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: việc bếp ăn đã đăng ký' })
  myTasks(@CurrentUser() user: User) {
    return this.campaignsService.myAssignments(user.id);
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

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết chiến dịch' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.findOne(id);
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

  @Post(':id/apply')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Volunteer: đăng ký tham gia một vai trò' })
  apply(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ApplyCampaignDto,
  ) {
    return this.campaignsService.apply(id, user.id, dto);
  }

  @Patch(':id/start')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: bắt đầu chiến dịch (open → in_progress)' })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.startCampaign(id, user.id);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: huỷ chiến dịch đang tuyển (open → cancelled)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.cancelCampaign(id, user.id);
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
  @UseGuards(RolesGuard)
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
  confirmDonation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.campaignsService.confirmDonation(id, user.id);
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
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const proofUrl = photo ? await this.campaignsService.saveProofPhoto(photo) : undefined;
    return this.campaignsService.advanceTask(id, user.id, proofUrl);
  }

  @Post('requests')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: gửi yêu cầu hợp tác đến provider' })
  sendProviderRequest(@CurrentUser() user: User, @Body() dto: SendProviderRequestDto) {
    return this.campaignsService.sendProviderRequest(user.id, dto);
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

  // ─── Manage endpoints (trang /campaigns/[id]/manage/*) ─────────────────────

  @Get(':id/manage-detail')
  @ApiOperation({ summary: 'Charity: chi tiết chiến dịch cho trang quản lý (bao gồm pending assignments)' })
  getManageDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getManageDetail(id);
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

  @Post(':id/distributions')
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

  @Post(':id/shifts')
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

  @Post(':id/menu-items')
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
}
