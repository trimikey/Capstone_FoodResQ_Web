import { Body, Controller, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
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

  @Post('google')
  @ApiOperation({ summary: 'Login/Register bằng Google ID token' })
  google(
    @Body() dto: GoogleLoginDto,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ) {
    return this.authService.loginWithGoogle(dto.idToken, ua, ip);
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
