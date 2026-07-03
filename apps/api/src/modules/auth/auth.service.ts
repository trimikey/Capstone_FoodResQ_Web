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
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';
import { FirebaseAdminService } from './firebase-admin.service';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  /** App firebase-admin riêng cho verify ID token (tách khỏi app FCM mặc định). */
  private firebaseApp?: App;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private firebaseAdmin: FirebaseAdminService,
  ) {}

  /**
   * Khởi tạo (lazy) firebase-admin Auth từ FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY.
   * Dùng app có tên 'auth' để không xung đột với app mặc định mà PushService (FCM) dùng.
   */
  private getFirebaseAuth() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKeyRaw = this.config.get<string>('FIREBASE_PRIVATE_KEY');
    if (!projectId || !clientEmail || !privateKeyRaw) {
      throw new ServiceUnavailableException('Đăng nhập Google (Firebase) chưa được cấu hình trên máy chủ');
    }
    if (!this.firebaseApp) {
      const APP_NAME = 'auth';
      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      const existing = getApps().find((a) => a.name === APP_NAME);
      this.firebaseApp =
        existing ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, APP_NAME);
    }
    return getAuth(this.firebaseApp);
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Toạ độ GPS lúc đăng ký (nếu người dùng cho phép định vị) → lưu vào cột
    // GEOGRAPHY để các flow tìm theo bán kính (PostGIS ST_DWithin) hoạt động ngay.
    const hasGeo = typeof dto.latitude === 'number' && typeof dto.longitude === 'number';

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
        const profile = await tx.receiverProfile.create({
          data: {
            userId: created.id,
            address: dto.address ?? null,
            isCharityOrg: dto.isCharityOrg ?? false,
            organizationName: dto.isCharityOrg ? (dto.businessName ?? dto.fullName) : null
          },
        });
        if (hasGeo) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE receiver_profiles
            SET location = ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)::geography
            WHERE id = ${profile.id}::uuid
          `);
        }
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
        const profile = await tx.providerProfile.create({
          data: {
            userId: created.id,
            businessName: dto.businessName ?? dto.fullName,
            businessType: 'other',
            address: dto.address ?? '',
          },
        });
        if (hasGeo) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE provider_profiles
            SET location = ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)::geography
            WHERE id = ${profile.id}::uuid
          `);
        }
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
    const auth = this.getFirebaseAuth();

    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;
    let emailVerified: boolean | undefined;
    try {
      const decoded = await auth.verifyIdToken(idToken);
      email = decoded.email;
      name = decoded.name as string | undefined;
      picture = decoded.picture;
      emailVerified = decoded.email_verified;
    } catch {
      throw new UnauthorizedException('Google token không hợp lệ');
    }
    if (emailVerified === false) throw new UnauthorizedException('Email Google chưa được xác minh');
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
   * Đăng nhập/đăng ký bằng Firebase ID token (dùng cho mobile: Google sign-in & Phone OTP).
   * Token được verify bằng Firebase Admin SDK — khác với /auth/google (verify Google OAuth token).
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
    let phone: string | undefined;
    try {
      const decoded = await this.firebaseAdmin.verifyIdToken(idToken);
      email = decoded.email;
      name = decoded.name as string | undefined;
      picture = decoded.picture;
      phone = decoded.phone_number;
      if (decoded.email && decoded.email_verified === false) {
        throw new UnauthorizedException('Email chưa được xác minh');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Firebase token không hợp lệ');
    }

    // Đăng nhập bằng phone OTP không có email → dùng phone làm khoá định danh
    if (!email && !phone) {
      throw new UnauthorizedException('Không lấy được email hoặc số điện thoại từ Firebase');
    }

    let user = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : await this.prisma.user.findFirst({ where: { phone, deletedAt: null } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const newRole = role ?? 'receiver';
      // Mật khẩu ngẫu nhiên vì đăng nhập qua Firebase, không dùng password
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);
      const fullName = name ?? email?.split('@')[0] ?? phone ?? 'Người dùng';
      // email là cột bắt buộc + unique. Đăng nhập phone OTP không có email → sinh placeholder
      const resolvedEmail = email ?? `${phone}@phone.foodresq.local`;
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: resolvedEmail,
            phone: phone ?? null,
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
