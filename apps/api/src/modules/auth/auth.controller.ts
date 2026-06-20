import { Body, Controller, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { FirebaseAuthDto } from './dto/firebase-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto);
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

  @Post('firebase')
  @ApiOperation({ summary: 'Đăng nhập/đăng ký qua Firebase (Google, Phone OTP)' })
  firebase(
    @Body() dto: FirebaseAuthDto,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ) {
    return this.authService.loginWithFirebase(dto.idToken, dto.role, ua, ip);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Gửi mã OTP đặt lại mật khẩu qua email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Luôn 200 với cùng message để không lộ email tồn tại hay không
    return { message: 'Nếu email tồn tại, mã OTP đã được gửi.' };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
    return { message: 'Đặt lại mật khẩu thành công.' };
  }
}
