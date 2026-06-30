import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, ApplyCampaignDto, CompleteCampaignDto, PledgeDonationDto } from './dto/campaign.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
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

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Charity: kết thúc chiến dịch + nhập số suất thực tế' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CompleteCampaignDto,
  ) {
    return this.campaignsService.completeCampaign(id, user.id, dto.actualServings);
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
}
