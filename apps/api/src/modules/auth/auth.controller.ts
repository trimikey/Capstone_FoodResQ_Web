import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Ip,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'selfie', maxCount: 1 },
      { name: 'idCard', maxCount: 1 },
      { name: 'vehiclePlateImage', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary:
      'Register a new account. Receiver (cá nhân) & volunteer BẮT BUỘC gửi kèm ảnh selfie; volunteer gửi thêm ảnh CCCD để so khớp eKYC.',
  })
  register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @UploadedFiles()
    files?: {
      selfie?: Express.Multer.File[];
      idCard?: Express.Multer.File[];
      vehiclePlateImage?: Express.Multer.File[];
    },
  ) {
    const selfie = files?.selfie?.[0];
    const idCard = files?.idCard?.[0];
    const vehiclePlateImage = files?.vehiclePlateImage?.[0];
    for (const file of [selfie, idCard]) {
      if (!file) continue;
      if (!/^image\/(jpeg|png)$/.test(file.mimetype)) {
        throw new BadRequestException('Ảnh khuôn mặt và CCCD phải là JPEG hoặc PNG.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('Mỗi ảnh tối đa 5MB.');
      }
    }
    if (vehiclePlateImage) {
      if (!/^image\/(jpeg|png|webp)$/.test(vehiclePlateImage.mimetype)) {
        throw new BadRequestException('Ảnh biển số phải là JPEG, PNG hoặc WEBP.');
      }
      if (vehiclePlateImage.size > 5 * 1024 * 1024) {
        throw new BadRequestException('Mỗi ảnh tối đa 5MB.');
      }
    }
    return this.authService.register(dto, selfie, idCard, vehiclePlateImage);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login and receive tokens' })
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ) {
    return this.authService.login(dto, ua, ip);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Gửi email đặt lại mật khẩu nếu tài khoản tồn tại' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng token nhận qua email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('google')
  @ApiOperation({ summary: 'Login/Register bằng Google ID token' })
  google(
    @Body() dto: GoogleLoginDto,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ) {
    return this.authService.loginWithGoogle(dto.idToken, ua, ip);
  }

  @Post('check-email')
  @ApiOperation({ summary: 'Kiểm tra email đã được đăng ký chưa' })
  checkEmail(@Body('email') email: string) {
    return this.authService.checkEmailExists(email);
  }

  @Post('check-phone')
  @ApiOperation({ summary: 'Kiểm tra số điện thoại đã được đăng ký chưa' })
  checkPhone(@Body('phone') phone: string) {
    return this.authService.checkPhoneExists(phone);
  }

  @Post('firebase')
  @ApiOperation({ summary: 'Login/Register bằng Firebase ID token (Google sign-in)' })
  firebase(
    @Body() dto: FirebaseLoginDto,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ) {
    return this.authService.loginWithFirebase(dto.idToken, dto.role, ua, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token' })
  refresh(
    @Body('refreshToken') token: string,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ) {
    return this.authService.refresh(token, ua, ip);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all refresh tokens for current user' })
  logout(@CurrentUser() user: User) {
    return this.authService.logout(user.id);
  }
}
