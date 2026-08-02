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
    const { user } = context.switchToHttp().getRequest<{ user: User }>();
    if (user.status === 'active') return true;
    throw new ForbiddenException(
      'Tài khoản của bạn đang chờ quản trị viên duyệt — không thể thực hiện thao tác này.',
    );
  }
}
