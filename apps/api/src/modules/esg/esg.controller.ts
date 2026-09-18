import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { EsgService } from './esg.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('ESG')
@Controller('esg')
export class EsgController {
  constructor(private esgService: EsgService) {}

  @Get('platform')
  @ApiOperation({ summary: 'Tổng quan tác động ESG toàn nền tảng (công khai)' })
  platform() {
    return this.esgService.getPlatformEsg();
  }

  @Get('provider/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Provider: báo cáo tác động ESG của cửa hàng' })
  providerMe(@CurrentUser() user: User) {
    return this.esgService.getProviderEsg(user.id);
  }

  @Get('provider/me/report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Provider: dữ liệu biểu đồ cho báo cáo CSR (chuỗi tháng, nhóm thực phẩm, tỷ lệ hoàn tất)',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    description: 'Số tháng gần nhất (1–24, mặc định 6)',
  })
  providerReport(@CurrentUser() user: User, @Query('months') months?: string) {
    return this.esgService.getProviderReport(
      user.id,
      months ? Number(months) : undefined,
    );
  }
}
