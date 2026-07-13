import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { User } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private firebaseAdmin: FirebaseAdminService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.');

    if (dto.phone) {
      const phoneExists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (phoneExists) throw new ConflictException('Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.');
    }

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
          data: { 
            userId: created.id, 
            address: dto.address ?? null,
            isCharityOrg: dto.isCharityOrg ?? false,
            organizationName: dto.isCharityOrg ? (dto.businessName ?? dto.fullName) : null
          },
        });
      } else if (dto.role === 'volunteer') {
        const vp = await tx.volunteerProfile.create({
          data: { userId: created.id, vehicleType: dto.vehicleType ?? null },
        });
        if (dto.volunteerRole) {
           await tx.volunteerSpecializationEntry.create({
              data: { volunteerId: vp.id, specialization: dto.volunteerRole }
           });
        }
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
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.');
    }

    if (user.status === 'banned') {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa. Liên hệ quản trị viên để được hỗ trợ.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user, deviceInfo, ipAddress);
  }

  /**
   * Đăng nhập/đăng ký bằng Google: verify ID token (kiểm tra audience = GOOGLE_CLIENT_ID),
   * email đã được Google xác thực nên tài khoản mới được kích hoạt luôn (role mặc định receiver).
   */
  async loginWithGoogle(idToken: string, deviceInfo?: string, ipAddress?: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new ServiceUnavailableException('Google login chưa được cấu hình trên máy chủ');
    }

    const client = new OAuth2Client(clientId);
    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      email = payload?.email;
      name = payload?.name;
      picture = payload?.picture;
      if (payload && payload.email_verified === false) {
        throw new UnauthorizedException('Email Google chưa được xác minh');
      }
    } catch {
      throw new UnauthorizedException('Google token không hợp lệ');
    }
    if (!email) throw new UnauthorizedException('Không lấy được email từ Google');

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Tạo tài khoản mới (receiver) — mật khẩu ngẫu nhiên vì đăng nhập qua Google
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: name ?? email.split('@')[0],
            avatarUrl: picture ?? null,
            role: 'receiver',
            status: 'active',
          },
        });
        await tx.receiverProfile.create({ data: { userId: created.id } });
        return created;
      });
    } else if (user.status === 'banned') {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    } else if (!user.avatarUrl && picture) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: picture, lastLoginAt: new Date() },
      });
    } else {
      await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    }

    return this.issueTokens(user, deviceInfo, ipAddress);
  }

  /**
   * Đăng nhập/đăng ký bằng Firebase ID token — CHỈ phục vụ Google sign-in.
   * Token bắt buộc phải có email (Google); token không email (vd phone) bị từ chối.
   */
  async loginWithFirebase(
    idToken: string,
    role?: 'receiver' | 'volunteer' | 'provider',
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;
    try {
      const decoded = await this.firebaseAdmin.verifyIdToken(idToken);
      email = decoded.email;
      name = decoded.name as string | undefined;
      picture = decoded.picture;
      if (decoded.email && decoded.email_verified === false) {
        throw new UnauthorizedException('Email chưa được xác minh');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Firebase token không hợp lệ');
    }

    if (!email) {
      throw new UnauthorizedException('Chỉ hỗ trợ đăng nhập bằng Google');
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const newRole = role ?? 'receiver';
      // Mật khẩu ngẫu nhiên vì đăng nhập qua Firebase, không dùng password
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);
      const fullName = name ?? email.split('@')[0] ?? 'Người dùng';
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName,
            avatarUrl: picture ?? null,
            role: newRole,
            status: 'active',
          },
        });
        if (newRole === 'receiver') {
          await tx.receiverProfile.create({ data: { userId: created.id } });
        } else if (newRole === 'volunteer') {
          await tx.volunteerProfile.create({ data: { userId: created.id } });
        } else if (newRole === 'provider') {
          await tx.providerProfile.create({
            data: { userId: created.id, businessName: fullName, businessType: 'other', address: '' },
          });
        }
        return created;
      });
    } else if (user.status === 'banned') {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          ...(!user.avatarUrl && picture ? { avatarUrl: picture } : {}),
        },
      });
    }

    const tokens = await this.issueTokens(user, deviceInfo, ipAddress);
    return { ...tokens, isNewUser };
  }

  async refresh(rawToken: string, deviceInfo?: string, ipAddress?: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
    }

    // Find by scanning active tokens and bcrypt-compare against the raw token
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

    if (!tokenRecord) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

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
