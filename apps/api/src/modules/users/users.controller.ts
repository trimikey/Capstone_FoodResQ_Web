import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@foodresq/types';
import { User } from '@prisma/client';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = /^image\/(jpeg|png)$/;

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy hồ sơ + thống kê của người dùng đang đăng nhập' })
  getMe(@CurrentUser() user: User) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân (họ tên, SĐT, avatar)' })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Get('me/face-enrollment')
  @Roles(UserRole.RECEIVER)
  @ApiOperation({ summary: 'Receiver: Trạng thái đăng ký khuôn mặt (eKYC)' })
  getFaceEnrollment(@CurrentUser() user: User) {
    return this.usersService.getFaceEnrollmentStatus(user.id);
  }

  @Post('me/face-enrollment')
  @Roles(UserRole.RECEIVER)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'idCard', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Receiver: Đăng ký khuôn mặt — chỉ cần selfie HOẶC ảnh CCCD (gửi cả hai sẽ so khớp chéo)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        idCard: { type: 'string', format: 'binary' },
        selfie: { type: 'string', format: 'binary' },
      },
    },
  })
  enrollFace(
    @CurrentUser() user: User,
    @UploadedFiles()
    files: { idCard?: Express.Multer.File[]; selfie?: Express.Multer.File[] },
  ) {
    const idCard = files.idCard?.[0];
    const selfie = files.selfie?.[0];
    if (!idCard && !selfie) {
      throw new BadRequestException('A selfie or an ID card photo is required');
    }
    for (const file of [idCard, selfie]) {
      if (!file) continue;
      if (!ALLOWED_MIME.test(file.mimetype)) {
        throw new BadRequestException('Only JPEG or PNG photos are allowed');
      }
      if (file.size > MAX_PHOTO_BYTES) {
        throw new BadRequestException('Each photo must be at most 5MB');
      }
    }
    return this.usersService.enrollFace(user.id, idCard, selfie);
  }
}
