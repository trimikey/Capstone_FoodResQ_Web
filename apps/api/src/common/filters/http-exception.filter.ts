import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

const FIELD_LABELS: Record<string, string> = {
  address: 'địa chỉ',
  lng: 'kinh độ',
  lat: 'vĩ độ',
  avatarUrl: 'ảnh đại diện',
  fullName: 'họ và tên',
  phone: 'số điện thoại',
  email: 'email',
  password: 'mật khẩu',
  confirmPassword: 'mật khẩu xác nhận',
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? `trường "${field}"`;
}

function translateValidationMessage(input: string): string {
  const message = input.trim();
  const forbidden = /^property ([\w.]+) should not exist$/.exec(message);
  if (forbidden)
    return `${fieldLabel(forbidden[1])} không được hỗ trợ ở thao tác này.`;

  const minLength =
    /^(\w+) must be longer than or equal to (\d+) characters$/.exec(message);
  if (minLength)
    return `${fieldLabel(minLength[1])} phải có ít nhất ${minLength[2]} ký tự.`;

  const maxLength =
    /^(\w+) must be shorter than or equal to (\d+) characters$/.exec(message);
  if (maxLength)
    return `${fieldLabel(maxLength[1])} không được vượt quá ${maxLength[2]} ký tự.`;

  const isString = /^(\w+) must be a string$/.exec(message);
  if (isString) return `${fieldLabel(isString[1])} phải là chuỗi ký tự.`;

  const isNumber = /^(\w+) must be a number/.exec(message);
  if (isNumber) return `${fieldLabel(isNumber[1])} phải là một số hợp lệ.`;

  if (message === 'Phone must be a valid Vietnamese mobile number') {
    return 'Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam.';
  }
  if (
    message ===
    'Password must contain at least one uppercase letter and one number'
  ) {
    return 'Mật khẩu phải có ít nhất một chữ hoa và một chữ số.';
  }
  if (
    message === 'avatarUrl must be an http(s) URL or an uploaded /uploads path'
  ) {
    return 'Ảnh đại diện phải là URL hợp lệ hoặc ảnh đã tải lên hệ thống.';
  }
  if (message === 'Only JPEG, PNG or WebP images are allowed') {
    return 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.';
  }
  if (message === 'File content does not match its image type') {
    return 'Nội dung file không khớp với định dạng ảnh.';
  }
  if (message === 'Cannot decode image — file may be corrupted') {
    return 'Không đọc được ảnh. File có thể đã bị lỗi.';
  }
  if (message === 'Face verification requires a JPEG or PNG photo') {
    return 'Xác minh khuôn mặt cần ảnh JPEG hoặc PNG.';
  }
  if (message === 'Unauthorized') {
    return 'Bạn cần đăng nhập để thực hiện thao tác này.';
  }

  return message;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Đã có lỗi xảy ra, vui lòng thử lại sau.';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const rawMessage = body.message;
        message = Array.isArray(rawMessage)
          ? rawMessage
              .map((item) => translateValidationMessage(String(item)))
              .join(', ')
          : translateValidationMessage(String(rawMessage));
      } else {
        message = translateValidationMessage(String(body));
      }
      code = exception.constructor.name.replace('Exception', '').toUpperCase();
    } else {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(String(exception), stack);
    }

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }
}
