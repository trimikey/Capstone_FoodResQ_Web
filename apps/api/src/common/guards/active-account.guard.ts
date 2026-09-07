import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * Chặn tài khoản chưa được admin duyệt (status != 'active') khỏi các hành động
 * "nặng": đăng ký chiến dịch, quyên góp, tạo đơn nhận, v.v.
 * Áp dụng SAU JwtAuthGuard + RolesGuard (cần có `req.user`).
 *
 * Lý do tách riêng:
 * - RolesGuard chỉ phân quyền theo role, không kiểm tra trạng thái tài khoản.
 * - User pending (chờ duyệt CCCD / hồ sơ) hay banned có thể vẫn đăng nhập
 *   nhưng KHÔNG được thao tác — phải hiện banner "Chờ admin duyệt" trên FE.
 */
@Injectable()
export class ActiveAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: User; method: string }>();
    // Route @Public không gắn user — xác thực do JwtAuthGuard quyết định, guard này bỏ qua.
    if (!request.user) return true;
    // Chỉ chặn thao tác GHI. GET vẫn cho qua để tài khoản chờ duyệt còn xem được
    // dashboard (kèm banner "chờ admin duyệt" phía FE) thay vì trang trắng toàn lỗi.
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return true;
    }
    if (request.user.status === 'active') return true;
    throw new ForbiddenException(
      'Tài khoản của bạn đang chờ quản trị viên duyệt — không thể thực hiện thao tác này.',
    );
  }
}
