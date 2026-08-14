import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { $Enums } from '@prisma/client';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { CreateReportDto } from './dto/create-report.dto';

// Nhãn tiếng Việt cho nội dung thông báo gửi admin — enum thô đọc rất khó hiểu.
const TARGET_VN: Record<string, string> = {
  user: 'người dùng',
  listing: 'tin thực phẩm',
  delivery: 'chuyến giao hàng',
  campaign: 'chiến dịch',
};

const REASON_VN: Record<string, string> = {
  spoiled_food: 'thực phẩm hỏng',
  fake_account: 'tài khoản giả mạo',
  hoarding: 'gom hàng',
  no_show_provider: 'cửa hàng không giao',
  unsafe_food: 'thực phẩm không an toàn',
  harassment: 'quấy rối',
  fraud: 'gian lận',
  other: 'lý do khác',
};

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    // Validate quyền sở hữu trước khi ghi nhận — chống spam & report đối phó
    await this.validateOwnership(reporterId, dto.targetType, dto.targetId);

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType as $Enums.ReportTargetType,
        targetId: dto.targetId,
        reason: dto.reason as $Enums.ReportReason,
        description: dto.description ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Khiếu nại nằm im trong DB cho tới khi có admin tình cờ mở trang — báo ngay
    // để việc xử lý không phụ thuộc vào việc ai đó nhớ vào kiểm tra.
    void this.notifications.notifyAdmins({
      type: 'report',
      title: 'Khiếu nại mới',
      body: `Có báo cáo mới về ${TARGET_VN[dto.targetType] ?? dto.targetType} — lý do: ${
        REASON_VN[dto.reason] ?? dto.reason
      }.`,
      data: { reportId: report.id, targetType: dto.targetType, targetId: dto.targetId },
    });

    return { ...report, message: 'Đã gửi báo cáo. Đội ngũ quản trị sẽ xem xét.' };
  }

  /**
   * Đảm bảo người báo cáo có liên quan thực sự đến đối tượng bị báo cáo.
   * - RESERVATION: chỉ receiver sở hữu mới được báo
   * - LISTING: bất kỳ ai cũng báo được (vd thấy listing sai)
   * - DELIVERY: bất kỳ ai cũng báo được (vd shipper vi phạm)
   * - USER: bất kỳ ai cũng báo được
   * - CAMPAIGN: bất kỳ ai cũng báo được
   */
  private async validateOwnership(
    reporterId: string,
    targetType: string,
    targetId: string,
  ): Promise<void> {
    if (targetType === 'reservation') {
      const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId: reporterId } });
      if (!receiver) {
        throw new ForbiddenException('Chỉ người nhận mới có thể báo cáo đơn đặt chỗ.');
      }
      const reservation = await this.prisma.reservation.findFirst({
        where: { id: targetId, receiverId: receiver.id },
        select: { id: true },
      });
      if (!reservation) {
        throw new ForbiddenException('Bạn không có quyền báo cáo đơn đặt chỗ này.');
      }
    }
    // Mọi target type khác: chỉ cần kiểm tra tồn tại để tránh báo cáo ma
    let exists: { id: string } | null = null;
    if (targetType === 'listing') {
      exists = await this.prisma.foodListing.findUnique({ where: { id: targetId }, select: { id: true } });
    } else if (targetType === 'delivery') {
      exists = await this.prisma.delivery.findUnique({ where: { id: targetId }, select: { id: true } });
    } else if (targetType === 'user') {
      exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    } else if (targetType === 'campaign') {
      exists = await this.prisma.kitchenCampaign.findUnique({ where: { id: targetId }, select: { id: true } });
    }
    if (!exists) {
      throw new NotFoundException('Đối tượng báo cáo không tồn tại hoặc đã bị xoá.');
    }
  }

  async findMine(reporterId: string) {
    return this.prisma.report.findMany({
      where: { reporterId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
