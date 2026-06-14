import { Controller, Get, Patch, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { UpdateDeliveryStatusDto, RejectOfferDto } from './dto/update-delivery-status.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

@ApiTags('Deliveries')
@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Get('my/active')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Get active delivery task' })
  getMyActive(@CurrentUser() user: User) {
    return this.deliveriesService.getMyActiveDelivery(user.id);
  }

  @Get('my/offers')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Get pending task offers' })
  getMyOffers(@CurrentUser() user: User) {
    return this.deliveriesService.getMyPendingOffers(user.id);
  }

  @Post(':id/accept')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Accept a delivery offer' })
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.deliveriesService.acceptOffer(id, user.id);
  }

  @Post(':id/reject')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Reject a delivery offer' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectOfferDto,
  ) {
    return this.deliveriesService.rejectOffer(id, user.id, dto.reason);
  }

  @Patch(':id/status')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: Advance delivery status (with optional proof photo URL)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveriesService.updateStatus(id, user.id, dto.status, dto.proofUrl);
  }
}
