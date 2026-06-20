import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from './mail.service';
import { FirebaseService, FirebaseIdentity } from './firebase.service';
import { User, UserRole } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const OTP_TTL_SECONDS = 600; // 10 phút

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
    private firebase: FirebaseService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Tạo user + profile theo role trong 1 transaction — các flow sau
    // (đặt chỗ, face enrollment, nhận task) đều yêu cầu profile tồn tại
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
          phone: dto.phone,
          status: 'pending_verification',
        },
      });

      if (dto.role === 'receiver') {
        await tx.receiverProfile.create({
          data: { userId: created.id, address: dto.address ?? null },
        });
      } else if (dto.role === 'volunteer') {
        await tx.volunteerProfile.create({
          data: { userId: created.id, vehicleType: dto.vehicleType ?? null },
        });
      } else if (dto.role === 'provider') {
        await tx.providerProfile.create({
          data: {
            userId: created.id,
            businessName: dto.businessName ?? dto.fullName,
            businessType: 'other',
            address: dto.address ?? '',
          },
        });
      }

      return created;
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto, deviceInfo?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'banned') {
      throw new UnauthorizedException('Account has been banned');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user, deviceInfo, ipAddress);
  }

  async refresh(rawToken: string, deviceInfo?: string, ipAddress?: string) {
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

    // Find by scanning active tokens for this hash (bcrypt compare)
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: { isRevoked: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    const tokenRecord = await (async () => {
      for (const t of activeTokens) {
        if (await bcrypt.compare(rawToken, t.tokenHash)) return t;
      }
      return null;
    })();

    if (!tokenRecord) throw new UnauthorizedException('Invalid refresh token');

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    return this.issueTokens(tokenRecord.user, deviceInfo, ipAddress);
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  // ── Forgot / Reset password (OTP qua email, lưu Redis) ────────────────────
  private otpKey(email: string) {
    return `otp:reset:${email.toLowerCase()}`;
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    // Luôn trả về như nhau để không lộ email có tồn tại hay không
    if (!user) return;

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(this.otpKey(email), otp, 'EX', OTP_TTL_SECONDS);
    await this.mail.sendPasswordResetOtp(email, otp);
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const key = this.otpKey(email);
    const stored = await this.redis.get(key);

    if (!stored || stored !== otp) {
      throw new BadRequestException('Mã OTP không đúng hoặc đã hết hạn');
    }

    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });
    if (!user) throw new BadRequestException('Tài khoản không tồn tại');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Xoá OTP + thu hồi mọi refresh token cũ để bảo mật
    await this.redis.del(key);
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  // ── Đăng nhập qua Firebase (Google / Phone OTP) ───────────────────────────
  /** Chuẩn hoá số VN từ E.164 (+84xxxxxxxxx) về dạng 0xxxxxxxxx để khớp tài khoản đăng ký thường. */
  private normalizeVnPhone(phone: string): string {
    return phone.startsWith('+84') ? `0${phone.slice(3)}` : phone;
  }

  async loginWithFirebase(
    idToken: string,
    role: UserRole | undefined,
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    const identity = await this.firebase.verifyIdToken(idToken);
    const phone = identity.phoneNumber ? this.normalizeVnPhone(identity.phoneNumber) : null;

    // Tìm tài khoản hiện có theo email (Google) hoặc phone (Phone OTP)
    let user = await this.findExistingFirebaseUser(identity.email, phone);
    let isNewUser = false;

    if (user) {
      // Bổ sung avatar/phone nếu tài khoản cũ còn thiếu (không ghi đè dữ liệu sẵn có)
      const patch: { avatarUrl?: string; phone?: string; lastLoginAt: Date } = {
        lastLoginAt: new Date(),
      };
      if (!user.avatarUrl && identity.picture) patch.avatarUrl = identity.picture;
      if (!user.phone && phone) patch.phone = phone;
      user = await this.prisma.user.update({ where: { id: user.id }, data: patch });
    } else {
      user = await this.createFirebaseUser(identity, phone, role ?? UserRole.receiver);
      isNewUser = true;
    }

    if (user.status === 'banned') {
      throw new UnauthorizedException('Account has been banned');
    }

    const tokens = await this.issueTokens(user, deviceInfo, ipAddress);
    return { ...tokens, isNewUser };
  }

  private async findExistingFirebaseUser(email: string | null, phone: string | null) {
    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) return byEmail;
    }
    if (phone) {
      const byPhone = await this.prisma.user.findUnique({ where: { phone } });
      if (byPhone) return byPhone;
    }
    return null;
  }

  private async createFirebaseUser(
    identity: FirebaseIdentity,
    phone: string | null,
    role: UserRole,
  ): Promise<User> {
    // email NOT NULL: user chỉ đăng nhập bằng phone → sinh email placeholder duy nhất theo uid
    const email = identity.email ?? `${identity.uid}@phone.foodresq.local`;
    // Ưu tiên tên từ provider (Google); user phone-only không có tên → đặt theo 4 số cuối SĐT
    const fullName =
      identity.name ??
      (phone ? `Người dùng ${phone.slice(-4)}` : null) ??
      (identity.email ? identity.email.split('@')[0] : null) ??
      'Người dùng FoodResQ';
    // passwordHash NOT NULL: tài khoản social/phone không dùng mật khẩu → hash chuỗi ngẫu nhiên không thể đăng nhập
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          fullName,
          role,
          avatarUrl: identity.picture,
          status: 'pending_verification',
        },
      });

      if (role === UserRole.receiver) {
        await tx.receiverProfile.create({ data: { userId: created.id } });
      } else if (role === UserRole.volunteer) {
        await tx.volunteerProfile.create({ data: { userId: created.id } });
      } else if (role === UserRole.provider) {
        await tx.providerProfile.create({
          data: { userId: created.id, businessName: fullName, businessType: 'other', address: '' },
        });
      }

      return created;
    });
  }

  private async issueTokens(user: User, deviceInfo?: string, ipAddress?: string) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const rawRefreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
    });

    const tokenHash = await bcrypt.hash(rawRefreshToken, BCRYPT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, deviceInfo, ipAddress, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        trustScore: user.trustScore,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
