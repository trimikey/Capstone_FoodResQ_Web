import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

/**
 * Gateway thông báo real-time. Client kết nối kèm JWT trong handshake.auth.token,
 * được join phòng `user:{userId}` để nhận sự kiện `notification:new`.
 */
@WebSocketGateway({
  cors: { origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'], credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization as string | undefined)?.replace('Bearer ', '');
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      void client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  /** Đẩy thông báo tới một người dùng (nếu đang online). */
  emitToUser(userId: string, event: string, data: unknown) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }
}
