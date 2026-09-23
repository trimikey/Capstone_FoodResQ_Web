/**
 * Tiến độ nguyên liệu của chiến dịch: mục tiêu tổ chức khai (`supplyItems`) so với
 * các khoản góp (`campaign_donations`). Hàm thuần, dùng chung cho CampaignsService
 * (chặn xin/nhận vượt số còn thiếu) và DishStepsService (chưa đủ nguyên liệu thì
 * chưa cho vào bếp) — hai nơi phải ra CÙNG một con số.
 */

export interface SupplyTarget {
  name: string;
  key: string;
  targetQuantity: number;
  unit: string;
}

export interface DonationForProgress {
  itemName: string;
  quantity: string | null;
  status: string;
}

export interface SupplyProgressItem {
  name: string;
  unit: string;
  targetQuantity: number;
  pledgedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  receivedRemainingQuantity: number;
  progressPercent: number;
  isTargetMet: boolean;
}

export function normalizeSupplyKey(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Chỉ lấy mục có đủ tên + đơn vị + số lượng > 0 — mục ghi chung chung không đo được. */
export function parseSupplyTargets(raw: unknown): SupplyTarget[] {
  if (!Array.isArray(raw)) return [];
  const targets: SupplyTarget[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const data = item as { name?: unknown; quantity?: unknown; unit?: unknown };
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const unit = typeof data.unit === 'string' ? data.unit.trim() : '';
    const quantity =
      typeof data.quantity === 'number'
        ? data.quantity
        : typeof data.quantity === 'string'
          ? Number(data.quantity)
          : NaN;
    if (!name || !unit || !Number.isFinite(quantity) || quantity <= 0) continue;
    targets.push({
      name,
      key: normalizeSupplyKey(name),
      targetQuantity: roundQuantity(quantity),
      unit,
    });
  }
  return targets;
}

/** "10 kg" → 10 khi đơn vị khớp mục tiêu; khác đơn vị thì không cộng (null). */
export function parseDonationQuantity(raw: string | null, expectedUnit: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return null;
  const quantity = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unit = match[2].trim();
  if (unit && normalizeSupplyKey(unit) !== normalizeSupplyKey(expectedUnit)) return null;
  return quantity;
}

export function buildSupplyProgress(
  supplyItems: unknown,
  donations: DonationForProgress[],
): SupplyProgressItem[] {
  return parseSupplyTargets(supplyItems).map((target) => {
    const related = donations.filter((d) => normalizeSupplyKey(d.itemName) === target.key);
    const pledgedQuantity = related.reduce((sum, d) => {
      if (!['pledged', 'received'].includes(d.status)) return sum;
      return sum + (parseDonationQuantity(d.quantity, target.unit) ?? 0);
    }, 0);
    const receivedQuantity = related.reduce((sum, d) => {
      if (d.status !== 'received') return sum;
      return sum + (parseDonationQuantity(d.quantity, target.unit) ?? 0);
    }, 0);
    const committedQuantity = roundQuantity(pledgedQuantity);
    const confirmedQuantity = roundQuantity(receivedQuantity);
    const remainingQuantity = roundQuantity(Math.max(0, target.targetQuantity - committedQuantity));
    const receivedRemainingQuantity = roundQuantity(Math.max(0, target.targetQuantity - confirmedQuantity));
    return {
      name: target.name,
      unit: target.unit,
      targetQuantity: target.targetQuantity,
      pledgedQuantity: committedQuantity,
      receivedQuantity: confirmedQuantity,
      remainingQuantity,
      receivedRemainingQuantity,
      progressPercent:
        target.targetQuantity > 0
          ? Math.min(100, Math.round((committedQuantity / target.targetQuantity) * 100))
          : 0,
      isTargetMet: remainingQuantity <= 0,
    };
  });
}

/**
 * Nguyên liệu bếp CÒN THIẾU tính theo số ĐÃ NHẬN thực tế (không tính hàng mới hứa
 * góp) — đây là điều kiện để bếp được bắt đầu sơ chế/nấu.
 */
export function missingReceivedSupplies(
  supplyItems: unknown,
  donations: DonationForProgress[],
): Array<{ name: string; unit: string; missing: number; target: number }> {
  return buildSupplyProgress(supplyItems, donations)
    .filter((p) => p.receivedRemainingQuantity > 0)
    .map((p) => ({ name: p.name, unit: p.unit, missing: p.receivedRemainingQuantity, target: p.targetQuantity }));
}
