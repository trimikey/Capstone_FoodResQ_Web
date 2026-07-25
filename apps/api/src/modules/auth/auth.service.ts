import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';
import Redis from 'ioredis';
import { OAuth2Client } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { FaceMatchService } from '@/common/face-match/face-match.service';
import { StorageService } from '@/common/storage/storage.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { User } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const PASSWORD_RESET_TTL_SECONDS = 15 * 60;
const PASSWORD_RESET_MESSAGE = 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.';

/** BusinessType cần MST + ảnh GPKD/ĐKKD (cá nhân/hộ gia đình thì miễn). */
const BUSINESS_TYPE_REQUIRES_TAXCODE = new Set([
  'restaurant',
  'supermarket',
  'bakery',
  'hotel',
]);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private firebaseAdmin: FirebaseAdminService,
    private faceMatch: FaceMatchService,
    private storage: StorageService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  async register(dto: RegisterDto, selfie?: Express.Multer.File) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.');

    if (dto.phone) {
      const phoneExists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (phoneExists) throw new ConflictException('Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.');
    }

    // eKYC BẮT BUỘC khi đăng ký: người nhận cá nhân & tình nguyện viên phải có
    // khuôn mặt hợp lệ TRƯỚC khi tạo tài khoản — không có/không nhận diện được
    // thì đăng ký THẤT BẠI (không tạo user). Tổ chức từ thiện & NCC không cần.
    const needsFace =
      (dto.role === 'receiver' && !dto.isCharityOrg) || dto.role === 'volunteer';
    let faceDescriptor: number[] | null = null;
    let faceImageUrl: string | null = null;
    if (needsFace) {
      if (!selfie) {
        throw new BadRequestException(
          'Cần ảnh khuôn mặt (selfie) để đăng ký. Vui lòng chụp ảnh rõ nét trước khi gửi.',
        );
      }
      faceDescriptor = await this.faceMatch.getFaceDescriptor(selfie);
      if (!faceDescriptor) {
        throw new BadRequestException(
          'Không nhận diện được khuôn mặt trong ảnh — đăng ký thất bại. Vui lòng chụp lại nơi đủ sáng, thấy rõ khuôn mặt.',
        );
      }
      faceImageUrl = await this.storage.saveImage(selfie, 'faces');
    }

    // Chuẩn hoá chuỗi để giảm khoảng trắng trước khi validate/insert.
    const fullName = dto.fullName.trim();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    if (dto.role === 'provider') {
      if (!dto.businessName?.trim() || !dto.address?.trim()) {
        throw new BadRequestException('Nhà cung cấp cần nhập tên cửa hàng và địa chỉ.');
      }
      if (dto.businessType && BUSINESS_TYPE_REQUIRES_TAXCODE.has(dto.businessType) && !dto.taxCode) {
        throw new BadRequestException(
          `Loại hình "${dto.businessType}" yêu cầu mã số thuế (taxCode) để admin xác minh doanh nghiệp.`,
        );
      }
      // evidenceUrls: optional nhưng nếu gửi thì phải có ít nhất 1 ảnh GPKD/ĐKKD ở index 0
      // (soft-check phía client, BE không ép vì có thể NCC cá nhân gửi ảnh CCCD sau).
    }

    // Tạo user + profile theo role trong 1 transaction — các flow sau
    // (đặt chỗ, face enrollment, nhận task) đều yêu cầu profile tồn tại
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName,
          role: dto.role,
          phone: dto.phone,
          status: 'pending_verification',
        },
      });

      if (dto.role === 'receiver') {
        const rp = await tx.receiverProfile.create({
          data: {
            userId: created.id,
            address: dto.address ?? null,
            isCharityOrg: dto.isCharityOrg ?? false,
            organizationName: dto.isCharityOrg ? (dto.businessName ?? fullName) : null,
            // eKYC đã xác thực ở trên (bắt buộc với cá nhân)
            ...(faceDescriptor ? { faceDescriptor, faceImageUrl } : {}),
          },
          select: { id: true },
        });
        // Lưu toạ độ đăng ký làm điểm giao mặc định (cột geography → raw SQL)
        if (dto.lng != null && dto.lat != null) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE receiver_profiles
            SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
                updated_at = NOW()
            WHERE id = ${rp.id}::uuid
          `);
        }
      } else if (dto.role === 'volunteer') {
        const vp = await tx.volunteerProfile.create({
          data: {
            userId: created.id,
            vehicleType: dto.vehicleType ?? null,
            // eKYC đã xác thực ở trên (bắt buộc với tình nguyện viên)
            ...(faceDescriptor ? { faceDescriptor, faceImageUrl } : {}),
          },
        });
        if (dto.volunteerRole) {
          await tx.volunteerSpecializationEntry.create({
            data: { volunteerId: vp.id, specialization: dto.volunteerRole },
          });
        }
      } else if (dto.role === 'provider') {
        const businessType = dto.businessType ?? 'other';
        const taxCode = dto.taxCode ?? null;
        const evidenceUrls = dto.evidenceUrls ?? [];

        // Insert location qua raw SQL vì cột là Unsupported("geography(Point,4326)")
        const providerProfile = await tx.providerProfile.create({
          data: {
            userId: created.id,
            businessName: dto.businessName ?? fullName,
            businessType: businessType as never,
            taxCode,
            description: dto.description ?? null,
            address: dto.address ?? '',
            contactPhone: dto.phone ?? null,
          },
          select: { id: true, businessName: true },
        });

        if (dto.lng != null && dto.lat != null) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE provider_profiles
            SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
                updated_at = NOW()
            WHERE id = ${providerProfile.id}::uuid
          `);
        }

        // Tạo verification_request cho admin duyệt — bundle tất cả bằng chứng vào documents JSON
        const documents = {
          businessName: providerProfile.businessName,
          businessType,
          taxCode,
          address: dto.address ?? '',
          lng: dto.lng ?? null,
          lat: dto.lat ?? null,
          description: dto.description ?? null,
          phone: dto.phone ?? null,
          evidenceUrls,
        };
        await tx.verificationRequest.create({
          data: {
            userId: created.id,
            requestType: 'provider_registration',
            status: 'pending',
            documents: documents as never,
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true, email: true, fullName: true, status: true },
    });

    if (!user || user.status === 'banned') {
      return { message: PASSWORD_RESET_MESSAGE };
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashResetToken(token);
    await this.redis.setex(
      this.passwordResetKey(tokenHash),
      PASSWORD_RESET_TTL_SECONDS,
      JSON.stringify({ userId: user.id }),
    );

    await this.sendPasswordResetEmail(user.email, user.fullName, token);

    return { message: PASSWORD_RESET_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = dto.token.trim();
    const tokenHash = this.hashResetToken(token);
    const key = this.passwordResetKey(tokenHash);
    const payload = await this.redis.get(key);

    if (!payload) {
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    let userId: string;
    try {
      userId = (JSON.parse(payload) as { userId?: string }).userId ?? '';
    } catch {
      await this.redis.del(key);
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    if (!userId) {
      await this.redis.del(key);
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!user || user.status === 'banned') {
      await this.redis.del(key);
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    });
    await this.redis.del(key);

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
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

  async checkEmailExists(email: string) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { exists: false };
    }
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return { exists: !!user };
  }

  async checkPhoneExists(phone: string) {
    if (!phone || !/^0[35789][0-9]{8}$/.test(phone)) {
      return { exists: false };
    }
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    return { exists: !!user };
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

  private hashResetToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private passwordResetKey(tokenHash: string) {
    return `auth:password-reset:${tokenHash}`;
  }

  private getFrontendOrigin() {
    const explicit = this.config.get<string>('FRONTEND_URL')?.trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const allowed = this.config.get<string>('ALLOWED_ORIGINS')?.split(',')[0]?.trim();
    if (allowed) return allowed.replace(/\/$/, '');

    return 'http://localhost:3000';
  }

  private async sendPasswordResetEmail(to: string, fullName: string, token: string) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('MAIL_FROM');

    if (!host || !port || !user || !pass || !from) {
      throw new ServiceUnavailableException('Email đặt lại mật khẩu chưa được cấu hình trên máy chủ.');
    }

    const resetLink = `${this.getFrontendOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Đặt lại mật khẩu FoodResQ';
    const text = [
      `Xin chào ${fullName},`,
      '',
      'FoodResQ nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
      `Mở liên kết sau để đặt mật khẩu mới: ${resetLink}`,
      '',
      `Mã đặt lại mật khẩu cho mobile: ${token}`,
      '',
      'Liên kết/mã này có hiệu lực trong 15 phút và chỉ dùng được một lần.',
      'Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.',
      '',
      'FoodResQ',
    ].join('\n');
    const html = `
      <div style="font-family:Arial,sans-serif;background:#f4f7f2;padding:32px;color:#14342b">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #dfe8dd">
          <h1 style="margin:0 0 8px;font-size:24px;color:#166534">FoodResQ</h1>
          <h2 style="margin:0 0 18px;font-size:22px;color:#111827">Đặt lại mật khẩu</h2>
          <p>Xin chào ${this.escapeHtml(fullName)},</p>
          <p>FoodResQ nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
          <p style="margin:24px 0">
            <a href="${resetLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">
              Đặt lại mật khẩu
            </a>
          </p>
          <p>Nếu dùng mobile, hãy sao chép mã sau vào màn đặt lại mật khẩu:</p>
          <p style="word-break:break-all;background:#f1f5f9;border-radius:10px;padding:12px;font-family:monospace">${token}</p>
          <p style="color:#64748b;font-size:14px">Liên kết/mã này có hiệu lực trong 15 phút và chỉ dùng được một lần.</p>
          <p style="color:#64748b;font-size:14px">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        </div>
      </div>
    `;

    await this.sendSmtpMail({
      host,
      port,
      user,
      pass,
      from,
      to,
      subject,
      text,
      html,
    });
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async sendSmtpMail(options: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    let socket!: net.Socket | tls.TLSSocket;
    let buffer = '';
    let responseLines: string[] = [];
    const responses: string[] = [];
    let waiter: ((response: string) => void) | null = null;
    let waitTimer: NodeJS.Timeout | null = null;

    const resetWaiter = () => {
      if (waitTimer) clearTimeout(waitTimer);
      waitTimer = null;
      waiter = null;
    };

    const pushResponse = (response: string) => {
      if (waiter) {
        const resolve = waiter;
        resetWaiter();
        resolve(response);
      } else {
        responses.push(response);
      }
    };

    const attachReader = (activeSocket: net.Socket | tls.TLSSocket) => {
      activeSocket.setEncoding('utf8');
      activeSocket.on('data', (chunk: string) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
          buffer = buffer.slice(newlineIndex + 1);
          responseLines.push(line);
          if (/^\d{3} /.test(line)) {
            pushResponse(responseLines.join('\n'));
            responseLines = [];
          }
          newlineIndex = buffer.indexOf('\n');
        }
      });
    };

    const waitResponse = async (expectedCodes: number[]) => {
      const response =
        responses.shift() ??
        (await new Promise<string>((resolve, reject) => {
          waiter = resolve;
          waitTimer = setTimeout(() => {
            resetWaiter();
            reject(new Error('SMTP response timeout'));
          }, 15_000);
        }));
      const code = Number(response.slice(0, 3));
      if (!expectedCodes.includes(code)) {
        throw new Error(`Unexpected SMTP response ${code}`);
      }
      return response;
    };

    const connect = async () => {
      if (options.port === 465) {
        socket = tls.connect({
          host: options.host,
          port: options.port,
          servername: options.host,
        });
        attachReader(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once('secureConnect', resolve);
          socket.once('error', reject);
        });
      } else {
        socket = net.connect({
          host: options.host,
          port: options.port,
        });
        attachReader(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once('connect', resolve);
          socket.once('error', reject);
        });
      }
    };

    const command = async (line: string, expectedCodes: number[]) => {
      socket.write(`${line}\r\n`);
      return waitResponse(expectedCodes);
    };

    try {
      await connect();
      await waitResponse([220]);
      await command('EHLO foodresq.local', [250]);
      if (options.port !== 465) {
        await command('STARTTLS', [220]);
        socket.removeAllListeners('data');
        socket = tls.connect({ socket, servername: options.host });
        buffer = '';
        responseLines = [];
        attachReader(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once('secureConnect', resolve);
          socket.once('error', reject);
        });
        await command('EHLO foodresq.local', [250]);
      }

      const auth = Buffer.from(`\u0000${options.user}\u0000${options.pass}`).toString('base64');
      await command(`AUTH PLAIN ${auth}`, [235]);
      await command(`MAIL FROM:<${this.extractEmailAddress(options.from)}>`, [250]);
      await command(`RCPT TO:<${options.to}>`, [250, 251]);
      await command('DATA', [354]);

      socket.write(`${this.buildEmailMessage(options)}\r\n.\r\n`);
      await waitResponse([250]);
      await command('QUIT', [221]);
    } catch {
      throw new ServiceUnavailableException('Không gửi được email đặt lại mật khẩu. Vui lòng thử lại sau.');
    } finally {
      if (waitTimer) clearTimeout(waitTimer);
      socket?.end();
    }
  }

  private buildEmailMessage(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const boundary = `foodresq-${crypto.randomBytes(12).toString('hex')}`;
    const subject = `=?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`;
    const lines = [
      `From: ${options.from}`,
      `To: ${options.to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.html,
      '',
      `--${boundary}--`,
    ];
    return lines.join('\r\n').replace(/^\./gm, '..');
  }

  private extractEmailAddress(value: string) {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] ?? value).trim();
  }
}
