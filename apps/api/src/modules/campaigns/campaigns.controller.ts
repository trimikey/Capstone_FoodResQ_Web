import { Body, Controller, Get, Param, Post, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, ApplyCampaignDto } from './dto/campaign.dto';
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
}
