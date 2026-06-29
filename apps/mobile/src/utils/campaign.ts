import type { CampaignStatus, Campaign } from '@/hooks/useCampaigns';

/** Nhãn + màu cho trạng thái chiến dịch. */
export const CAMPAIGN_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Chờ duyệt', color: '#6b7280', bg: '#f3f4f6' },
  open: { label: 'Đang tuyển', color: '#10b981', bg: '#ecfdf5' },
  in_progress: { label: 'Đang diễn ra', color: '#2563eb', bg: '#eff6ff' },
  completed: { label: 'Hoàn thành', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: 'Đã huỷ', color: '#ef4444', bg: '#fef2f2' },
};

export function statusMeta(status: CampaignStatus) {
  return CAMPAIGN_STATUS_META[status] ?? { label: String(status), color: '#6b7280', bg: '#f3f4f6' };
}

/** Provider chỉ quyên góp được khi chiến dịch đang mở hoặc đang diễn ra. */
export function canDonate(status: CampaignStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

/** Charity chỉ bắt đầu được chiến dịch khi đã duyệt (status 'open'). */
export function canStartCampaign(status: CampaignStatus): boolean {
  return status === 'open';
}

/** Charity chỉ kết thúc được khi chiến dịch đang diễn ra. */
export function canCompleteCampaign(status: CampaignStatus): boolean {
  return status === 'in_progress';
}

/** Nhãn tiếng Việt cho vai trò tình nguyện viên. */
export const ASSIGNMENT_ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

/** "2026-07-15" → "15/07/2026"; chuỗi rỗng nếu không hợp lệ. */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "08:00:00" → "08:00". */
export function formatTime(t: string): string {
  if (!t) return '';
  return t.slice(0, 5);
}

/** Tên hiển thị của tổ chức từ thiện chủ chiến dịch. */
export function charityName(c: Campaign): string {
  return c.charityReceiver?.organizationName || c.charityReceiver?.user?.fullName || 'Tổ chức từ thiện';
}

export interface SlotProgress {
  role: 'chef' | 'waiter' | 'shipper';
  label: string;
  filled: number;
  needed: number;
}

/** Tiến độ tuyển TNV theo từng vai trò (bỏ vai trò không cần). */
export function slotProgress(c: Campaign): SlotProgress[] {
  return [
    { role: 'chef' as const, label: 'Đầu bếp', filled: c.chefSlotsFilled, needed: c.chefSlotsNeeded },
    { role: 'waiter' as const, label: 'Phục vụ', filled: c.waiterSlotsFilled, needed: c.waiterSlotsNeeded },
    { role: 'shipper' as const, label: 'Giao hàng', filled: c.shipperSlotsFilled, needed: c.shipperSlotsNeeded },
  ].filter((s) => s.needed > 0);
}
