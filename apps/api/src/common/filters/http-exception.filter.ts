import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'message' in body) {
        message = Array.isArray((body as { message: unknown }).message)
          ? ((body as { message: string[] }).message.join(', '))
          : String((body as { message: unknown }).message);
      } else {
        message = String(body);
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
