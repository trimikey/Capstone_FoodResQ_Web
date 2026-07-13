import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';

/**
 * Điểm uy tín dùng chung cho mọi module (reservations, deliveries, ...):
 * cộng/trừ điểm + ghi lịch sử + tự khoá/hạn chế tài khoản theo ngưỡng cấu hình.
 */
@Injectable()
export class TrustService {
  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
  ) {}

  async applyDelta(
    userId: string,
    delta: number,
    reason: string,
    referenceType: string,
    referenceId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const newScore = Math.min(100, Math.max(0, user.trustScore + delta));

    // Ngưỡng khoá/hạn chế đọc live từ system_configs (admin chỉnh được)
    const banThreshold = await this.systemConfig.getNumber('TRUST_BAN_THRESHOLD');
    const restrictThreshold = await this.systemConfig.getNumber('TRUST_RESTRICT_THRESHOLD');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          trustScore: newScore,
          // Auto-ban/suspend theo ngưỡng cấu hình
          status: newScore <= banThreshold ? 'banned' : newScore <= restrictThreshold ? 'suspended' : user.status,
        },
      }),
      this.prisma.trustScoreHistory.create({
        data: {
          userId,
          delta,
          reason: reason as never,
          referenceType,
          referenceId,
          scoreBefore: user.trustScore,
          scoreAfter: newScore,
        },
      }),
      // Force-revoke all refresh tokens on ban
      ...(newScore <= banThreshold
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId, isRevoked: false },
              data: { isRevoked: true, revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
  }
}
