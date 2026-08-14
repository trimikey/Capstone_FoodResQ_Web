import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface ConfigDef {
  key: string;
  label: string;
  description: string;
  group: string;
  unit: string;
  min: number;
  max: number;
  default: number;
}

/** Các khoá cấu hình admin chỉnh được (không cần deploy). Mirror CLAUDE.md §8. */
export const CONFIG_DEFS: ConfigDef[] = [
  { key: 'MAX_RESERVATIONS_PER_DAY', label: 'Số lượt đặt tối đa / ngày', description: 'Giới hạn số đơn miễn phí mỗi người nhận trong một ngày.', group: 'Đặt chỗ', unit: 'lượt', min: 1, max: 20, default: 3 },
  { key: 'QR_VALIDITY_MINUTES', label: 'Hiệu lực mã QR', description: 'Thời gian mã QR còn dùng được sau khi đặt chỗ.', group: 'Đặt chỗ', unit: 'phút', min: 5, max: 240, default: 30 },
  { key: 'HANDOFF_QR_VALIDITY_MINUTES', label: 'Hiệu lực QR nhận suất', description: 'Thời gian QR của người nhận còn dùng được để waiter xác nhận phát suất ăn.', group: 'Chiến dịch', unit: 'phút', min: 1, max: 30, default: 5 },
  { key: 'SEARCH_RADIUS_KM', label: 'Bán kính tìm kiếm mặc định', description: 'Bán kính gợi ý khi người dùng tìm thực phẩm gần.', group: 'Tìm kiếm', unit: 'km', min: 1, max: 50, default: 5 },
  { key: 'SHIPPER_OFFER_EXPIRY_SECONDS', label: 'Hết hạn lời mời shipper', description: 'Thời gian shipper phải phản hồi lời mời giao hàng trước khi chuyển lượt cho người kế tiếp.', group: 'Giao hàng', unit: 'giây', min: 10, max: 120, default: 15 },
  { key: 'CAMPAIGN_MIN_FILL_PERCENT', label: 'Tỉ lệ tuyển tối thiểu để chạy', description: 'Chiến dịch phải tuyển đủ ít nhất bao nhiêu phần trăm số tình nguyện viên cần thì tổ chức mới bắt đầu chạy được. Đặt 0 để bỏ ràng buộc.', group: 'Chiến dịch', unit: '%', min: 0, max: 100, default: 50 },
  { key: 'CHECKIN_GRACE_MINUTES', label: 'Ân hạn điểm danh trễ', description: 'Điểm danh trễ trong khoảng này vẫn coi là đúng giờ, không bị trừ uy tín.', group: 'Chiến dịch', unit: 'phút', min: 0, max: 180, default: 15 },
  { key: 'CHECKIN_LATE_PENALTY', label: 'Điểm trừ khi điểm danh trễ', description: 'Số điểm uy tín bị trừ khi tình nguyện viên điểm danh trễ quá thời gian ân hạn. Đặt 0 để không phạt.', group: 'Chiến dịch', unit: 'điểm', min: 0, max: 50, default: 5 },
  { key: 'TRUST_RESTRICT_THRESHOLD', label: 'Ngưỡng hạn chế (uy tín)', description: 'Điểm uy tín ≤ ngưỡng này sẽ bị hạn chế (suspended).', group: 'Uy tín', unit: 'điểm', min: 0, max: 100, default: 60 },
  { key: 'TRUST_BAN_THRESHOLD', label: 'Ngưỡng khoá (uy tín)', description: 'Điểm uy tín ≤ ngưỡng này sẽ bị khoá (banned).', group: 'Uy tín', unit: 'điểm', min: 0, max: 100, default: 30 },
];

@Injectable()
export class SystemConfigService {
  private cache = new Map<string, number>();
  private cacheAt = 0;
  private readonly TTL_MS = 30_000;

  constructor(private prisma: PrismaService) {}

  private def(key: string): ConfigDef | undefined {
    return CONFIG_DEFS.find((d) => d.key === key);
  }

  private async refreshCache() {
    if (this.cache.size > 0 && Date.now() - this.cacheAt < this.TTL_MS) return;
    const rows = await this.prisma.systemConfig.findMany();
    this.cache = new Map(rows.map((r) => [r.key, Number(r.value)]));
    this.cacheAt = Date.now();
  }

  /** Đọc giá trị số (DB override → mặc định). Có cache ngắn để không tốn query mỗi request. */
  async getNumber(key: string): Promise<number> {
    await this.refreshCache();
    const v = this.cache.get(key);
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    return this.def(key)?.default ?? 0;
  }

  /** Toàn bộ cấu hình + giá trị hiện tại cho trang admin. */
  async getAll() {
    const rows = await this.prisma.systemConfig.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return CONFIG_DEFS.map((d) => {
      const row = byKey.get(d.key);
      return {
        ...d,
        value: row ? Number(row.value) : d.default,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  /** Cập nhật một khoá (có kiểm tra min/max), xoá cache để có hiệu lực ngay. */
  async set(key: string, value: number, userId: string) {
    const def = this.def(key);
    if (!def) throw new BadRequestException('Khoá cấu hình không hợp lệ.');
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException('Giá trị phải là một số.');
    }
    if (value < def.min || value > def.max) {
      throw new BadRequestException(`${def.label} phải trong khoảng ${def.min}–${def.max} ${def.unit}.`);
    }
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, description: def.description, updatedBy: userId },
      update: { value, updatedBy: userId },
    });
    this.cache.clear();
    this.cacheAt = 0;
    return this.getAll();
  }
}
