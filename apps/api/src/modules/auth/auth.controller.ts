import {
  Body,
  Controller,
  FileTypeValidator,
  Headers,
  Ip,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
  @UseInterceptors(FileInterceptor('selfie'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary:
      'Register a new account. Receiver (cá nhân) & volunteer BẮT BUỘC gửi kèm ảnh selfie (multipart) — không có/không nhận diện được khuôn mặt thì đăng ký thất bại.',
  })
  register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false, // provider/charity đăng ký JSON không kèm ảnh
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    selfie?: Express.Multer.File,
  ) {
    return this.authService.register(dto, selfie);
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
