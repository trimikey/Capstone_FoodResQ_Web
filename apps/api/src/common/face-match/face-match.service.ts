import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { join, dirname } from 'path';
import * as jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
// Bản node-wasm chạy thuần JS/WASM — không cần build native (tfjs-node) trên Windows.
// Model weights được đóng gói sẵn trong package @vladmandic/face-api/model.
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const wasmBackend = require('@tensorflow/tfjs-backend-wasm');
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

// Khoảng cách euclidean giữa 2 descriptor 128 chiều — chuẩn của model face recognition
// (dlib-style): cùng người thường < 0.5, khác người > 0.6.
const DEFAULT_MATCH_THRESHOLD = 0.6;

export interface FaceCompareResult {
  matched: boolean;
  distance: number;
  threshold: number;
}

@Injectable()
export class FaceMatchService {
  private readonly logger = new Logger(FaceMatchService.name);
  private initPromise: Promise<void> | null = null;
  readonly threshold =
    Number(process.env['FACE_MATCH_THRESHOLD']) > 0
      ? Number(process.env['FACE_MATCH_THRESHOLD'])
      : DEFAULT_MATCH_THRESHOLD;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /**
   * Chặn một khuôn mặt gắn cho nhiều tài khoản: so descriptor mới với TOÀN BỘ
   * descriptor đã lưu (receiver + volunteer, mỗi bảng vài trăm dòng — so local
   * bằng euclidean nên rẻ). Bật/tắt qua system_configs FACE_DUPLICATE_CHECK
   * để admin tạo nhanh tài khoản test khi cần.
   *
   * @param excludeUserId bỏ qua chính chủ — ghi danh lại khuôn mặt của mình
   *   không được tính là trùng.
   */
  async assertNotDuplicateFace(descriptor: number[], excludeUserId?: string): Promise<void> {
    const enabled = await this.systemConfig.getNumber('FACE_DUPLICATE_CHECK');
    if (!enabled) return;
    const rows = await this.prisma.$queryRaw<{ user_id: string; face_descriptor: unknown }[]>(
      Prisma.sql`
        SELECT user_id, face_descriptor FROM receiver_profiles WHERE face_descriptor IS NOT NULL
        UNION ALL
        SELECT user_id, face_descriptor FROM volunteer_profiles WHERE face_descriptor IS NOT NULL
      `,
    );
    for (const row of rows) {
      if (excludeUserId && row.user_id === excludeUserId) continue;
      const stored = row.face_descriptor;
      if (!Array.isArray(stored) || stored.length !== descriptor.length) continue;
      if (this.compare(descriptor, stored as number[]).matched) {
        throw new ConflictException(
          'Khuôn mặt này đã được đăng ký cho một tài khoản khác — mỗi người chỉ dùng một tài khoản. Nếu bạn cho rằng có nhầm lẫn, vui lòng liên hệ quản trị viên.',
        );
      }
    }
  }

  /** Load tfjs backend + model weights một lần duy nhất (lazy, gọi ở request đầu tiên). */
  private init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((err) => {
        this.initPromise = null; // cho phép retry ở request sau
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const tf = faceapi.tf;
    try {
      const wasmDir = dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json'));
      wasmBackend.setWasmPaths(join(wasmDir, 'dist').replace(/\\/g, '/') + '/');
      await tf.setBackend('wasm');
      await tf.ready();
    } catch {
      // WASM không khởi tạo được → backend CPU thuần JS (chậm hơn nhưng luôn chạy)
      await tf.setBackend('cpu');
      await tf.ready();
      this.logger.warn('WASM backend unavailable — falling back to CPU backend');
    }

    const modelDir = join(
      dirname(require.resolve('@vladmandic/face-api/package.json')),
      'model',
    );
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
    this.logger.log(`Face models loaded (backend: ${tf.getBackend()})`);
  }

  /**
   * Trích descriptor 128 chiều của khuôn mặt trong ảnh.
   * Trả null nếu không phát hiện được khuôn mặt nào.
   */
  async getFaceDescriptor(file: Express.Multer.File): Promise<number[] | null> {
    await this.init();
    const tf = faceapi.tf;
    const { data, width, height } = this.decodeImage(file);

    // RGBA → RGB tensor, THU NHỎ về tối đa 800px cạnh dài ngay tại đây: ảnh camera
    // gốc ~12MP cho ra tensor int32 ~144MB — server 512MB (Render free) bị OOM kill
    // giữa request và trả 502. Detector chỉ nhìn 512px nên không mất độ chính xác.
    const MAX_DIM = 800;
    const scale = Math.min(1, MAX_DIM / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(height - 1, Math.round(y / scale));
      for (let x = 0; x < w; x++) {
        const si = (sy * width + Math.min(width - 1, Math.round(x / scale))) * 4;
        const di = (y * w + x) * 3;
        rgb[di] = data[si]!;
        rgb[di + 1] = data[si + 1]!;
        rgb[di + 2] = data[si + 2]!;
      }
    }
    const tensor = tf.tensor3d(rgb, [h, w, 3], 'int32');

    try {
      const detection = await faceapi
        .detectSingleFace(
          tensor,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      return detection ? Array.from(detection.descriptor as Float32Array) : null;
    } finally {
      tensor.dispose();
    }
  }

  /** So khớp 2 descriptor — matched=true nếu khoảng cách dưới ngưỡng. */
  compare(descriptorA: number[], descriptorB: number[]): FaceCompareResult {
    const distance: number = faceapi.euclideanDistance(descriptorA, descriptorB);
    return {
      matched: distance <= this.threshold,
      distance: Math.round(distance * 1000) / 1000,
      threshold: this.threshold,
    };
  }

  private decodeImage(file: Express.Multer.File): {
    data: Uint8Array;
    width: number;
    height: number;
  } {
    try {
      if (file.mimetype === 'image/jpeg') {
        const decoded = jpeg.decode(file.buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
        return { data: decoded.data, width: decoded.width, height: decoded.height };
      }
      if (file.mimetype === 'image/png') {
        const decoded = PNG.sync.read(file.buffer);
        return {
          data: new Uint8Array(decoded.data),
          width: decoded.width,
          height: decoded.height,
        };
      }
    } catch {
      throw new BadRequestException('Cannot decode image — file may be corrupted');
    }
    // face match chỉ hỗ trợ JPEG/PNG (decoder thuần JS); camera FE luôn xuất JPEG
    throw new BadRequestException('Face verification requires a JPEG or PNG photo');
  }
}
