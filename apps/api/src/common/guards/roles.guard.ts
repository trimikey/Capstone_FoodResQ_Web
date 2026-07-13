import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@foodresq/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '@prisma/client';

// Tên vai trò hiển thị cho người dùng trong thông báo lỗi
const ROLE_LABEL: Record<string, string> = {
  [UserRole.ADMIN]: 'quản trị viên',
  [UserRole.PROVIDER]: 'nhà cung cấp',
  [UserRole.RECEIVER]: 'người nhận',
  [UserRole.VOLUNTEER]: 'tình nguyện viên',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: User }>();
    if (requiredRoles.includes(user.role as UserRole)) return true;

    const allowed = requiredRoles.map((r) => ROLE_LABEL[r] ?? r).join(' hoặc ');
    const current = ROLE_LABEL[user.role] ?? user.role;
    throw new ForbiddenException(
      `Chức năng này chỉ dành cho tài khoản ${allowed}. Bạn đang đăng nhập bằng tài khoản ${current}.`,
    );
  }
}
