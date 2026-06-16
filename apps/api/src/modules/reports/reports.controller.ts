import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Gửi báo cáo về listing/người dùng/đơn giao/chiến dịch' })
  create(@CurrentUser() user: User, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user.id, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Danh sách báo cáo của tôi' })
  findMine(@CurrentUser() user: User) {
    return this.reportsService.findMine(user.id);
  }
}
