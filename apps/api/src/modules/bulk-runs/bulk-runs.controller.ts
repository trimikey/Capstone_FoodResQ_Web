import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BulkRunsService } from './bulk-runs.service';
import { RequestBulkRunDto, RejectBulkRunDto, AddStopDto, ServeStopDto } from './dto/bulk-run.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const proofPipe = new ParseFilePipe({
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_PROOF_BYTES }),
    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
  ],
});

@ApiTags('BulkRuns')
@Controller('bulk-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BulkRunsController {
  constructor(private bulkRuns: BulkRunsService) {}

  @Post()
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: yêu cầu giao sỉ (≥10 phần) từ một listing' })
  request(@CurrentUser() user: User, @Body() dto: RequestBulkRunDto) {
    return this.bulkRuns.request(user.id, dto);
  }

  @Get('my')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: các chuyến giao sỉ của tôi (active + lịch sử gần nhất)' })
  my(@CurrentUser() user: User) {
    return this.bulkRuns.myRuns(user.id);
  }

  @Get('provider')
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: yêu cầu giao sỉ trên các tin của tôi (chờ duyệt lên đầu)' })
  provider(@CurrentUser() user: User) {
    return this.bulkRuns.providerRuns(user.id);
  }

  @Post(':id/approve')
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: duyệt yêu cầu (trừ kho trong lock)' })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bulkRuns.approve(id, user.id);
  }

  @Post(':id/reject')
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Provider: từ chối yêu cầu' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectBulkRunDto,
  ) {
    return this.bulkRuns.reject(id, user.id, dto.reason);
  }

  @Post(':id/pickup')
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Shipper: xác nhận đã lấy hàng (kèm ảnh bàn giao tuỳ chọn)' })
  async pickup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @UploadedFile(proofPipe) photo?: Express.Multer.File,
  ) {
    const url = photo ? await this.bulkRuns.saveProofPhoto(photo) : undefined;
    return this.bulkRuns.pickup(id, user.id, url);
  }

  @Post(':id/stops')
  @Roles(UserRole.VOLUNTEER, UserRole.PROVIDER)
  @ApiOperation({ summary: 'Ghim điểm phát (NCC chủ tin hoặc shipper của chuyến)' })
  addStop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddStopDto,
  ) {
    return this.bulkRuns.addStop(id, user.id, dto);
  }

  @Post(':id/stops/:stopId/serve')
  @Roles(UserRole.VOLUNTEER)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Shipper: ghi nhận đã phát N phần tại điểm (kèm ảnh tuỳ chọn); đủ số phần thì tự hoàn tất' })
  async serve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @CurrentUser() user: User,
    @Body() dto: ServeStopDto,
    @UploadedFile(proofPipe) photo?: Express.Multer.File,
  ) {
    const url = photo ? await this.bulkRuns.saveProofPhoto(photo) : undefined;
    return this.bulkRuns.serve(id, user.id, stopId, dto, url);
  }

  @Post(':id/complete')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: kết thúc chuyến — phần chưa phát hoàn về tin' })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bulkRuns.complete(id, user.id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.VOLUNTEER)
  @ApiOperation({ summary: 'Shipper: huỷ yêu cầu/chuyến (chỉ trước khi lấy hàng)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bulkRuns.cancel(id, user.id);
  }
}
