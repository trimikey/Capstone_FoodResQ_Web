import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { UserRole } from '@foodresq/types';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ActiveAccountGuard } from '@/common/guards/active-account.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CampaignIncidentsService } from './campaign-incidents.service';
import {
  ReassignCampaignIncidentDto,
  ReportCampaignIncidentDto,
  ResolveCampaignIncidentDto,
} from './dto/campaign-incident.dto';

@ApiTags('Campaign incidents')
@Controller('campaigns')
@UseGuards(JwtAuthGuard, ActiveAccountGuard)
@ApiBearerAuth()
export class CampaignIncidentsController {
  constructor(private readonly incidents: CampaignIncidentsService) {}

  @Post(':id/incidents')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Shipper báo sự cố khi đi lấy nguyên liệu / đi phát suất ăn của chiến dịch' })
  report(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportCampaignIncidentDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.incidents.report(id, user.id, dto, photo);
  }

  @Get(':id/incidents')
  @ApiOperation({ summary: 'Sự cố của chiến dịch — tổ chức thấy hết, TNV thấy sự cố của mình' })
  list(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.list(id, user.id);
  }

  @Patch('incidents/:incidentId/reassign')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức đổi shipper cho việc bị bỏ dở vì sự cố' })
  reassign(
    @CurrentUser() user: User,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ReassignCampaignIncidentDto,
  ) {
    return this.incidents.reassign(incidentId, user.id, dto.ids);
  }

  @Patch('distributions/:distributionId/assignees')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức phân công (thêm) người đi phát cho đợt đang bỏ trống' })
  assignDistribution(
    @CurrentUser() user: User,
    @Param('distributionId', ParseUUIDPipe) distributionId: string,
    @Body() dto: ReassignCampaignIncidentDto,
  ) {
    return this.incidents.reassignDistributionByOwner(distributionId, user.id, dto.ids);
  }

  @Patch('incidents/:incidentId/resolve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Tổ chức đánh dấu sự cố đã xử lý' })
  resolve(
    @CurrentUser() user: User,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveCampaignIncidentDto,
  ) {
    return this.incidents.resolve(incidentId, user.id, dto.note);
  }
}
