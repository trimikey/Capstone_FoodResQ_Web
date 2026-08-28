import type { CampaignStatus, Campaign } from '@/hooks/useCampaigns';

/** Nhãn + màu cho trạng thái chiến dịch. */
export const CAMPAIGN_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_approval: { label: 'Chờ duyệt', color: '#6b7280', bg: '#f3f4f6' },
  approved: { label: 'Đã duyệt', color: '#10b981', bg: '#ecfdf5' },
  in_progress: { label: 'Đang diễn ra', color: '#2563eb', bg: '#eff6ff' },
  completed: { label: 'Hoàn thành', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: 'Đã huỷ', color: '#ef4444', bg: '#fef2f2' },
};

export function statusMeta(status: CampaignStatus) {
  return CAMPAIGN_STATUS_META[status] ?? { label: String(status), color: '#6b7280', bg: '#f3f4f6' };
}

/** Provider chỉ quyên góp được khi chiến dịch đang mở hoặc đang diễn ra. */
export function canDonate(status: CampaignStatus): boolean {
  return status === 'approved' || status === 'in_progress';
}

/** TNV chỉ đăng ký khi chiến dịch đã duyệt và cửa sổ tuyển đang mở. */
export function canApplyCampaign(status: CampaignStatus, recruitmentStatus?: string | null): boolean {
  return status === 'approved' && recruitmentStatus === 'open';
}

/** Trạng thái công việc TNV trong chiến dịch. */
export type AssignmentStatus = 'assigned' | 'checked_in' | 'in_progress' | 'completed' | (string & {});

/** Các bước công việc của TNV theo thứ tự (timeline). */
export const ASSIGNMENT_STEPS: { key: AssignmentStatus; label: string }[] = [
  { key: 'assigned', label: 'Đã đăng ký' },
  { key: 'checked_in', label: 'Điểm danh tại bếp' },
  { key: 'in_progress', label: 'Đang làm việc' },
  { key: 'completed', label: 'Hoàn thành' },
];
export const ASSIGNMENT_STEP_ORDER = ASSIGNMENT_STEPS.map((s) => s.key);

/** Bước kế tiếp của công việc; null nếu đã hoàn thành. Khớp ASSIGN_NEXT ở backend. */
const ASSIGNMENT_NEXT: Record<string, AssignmentStatus> = {
  assigned: 'checked_in',
  checked_in: 'in_progress',
  in_progress: 'completed',
};
export function nextAssignmentStatus(status: string): AssignmentStatus | null {
  return ASSIGNMENT_NEXT[status] ?? null;
}

/** Nhãn + màu cho trạng thái công việc TNV. */
export const ASSIGNMENT_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  assigned: { label: 'Đã đăng ký', color: '#6b7280', bg: '#f3f4f6' },
  checked_in: { label: 'Đã điểm danh', color: '#2563eb', bg: '#eff6ff' },
  in_progress: { label: 'Đang làm việc', color: '#d97706', bg: '#fffbeb' },
  completed: { label: 'Hoàn thành', color: '#059669', bg: '#ecfdf5' },
};
export function assignmentStatusMeta(status: string) {
  return ASSIGNMENT_STATUS_META[status] ?? { label: String(status), color: '#6b7280', bg: '#f3f4f6' };
}

/** Chuyển sang "đang làm" / "hoàn thành" cần ảnh minh chứng (nguyên liệu / kết quả). */
export function assignmentStepRequiresPhoto(next: string): boolean {
  return next === 'in_progress' || next === 'completed';
}

/** Nhãn nút chuyển bước công việc theo trạng thái hiện tại. */
export function advanceTaskLabel(status: string): string {
  switch (status) {
    case 'assigned':
      return 'Điểm danh tại bếp';
    case 'checked_in':
      return 'Bắt đầu làm việc — chụp ảnh';
    case 'in_progress':
      return 'Hoàn thành — chụp kết quả';
    default:
      return 'Cập nhật';
  }
}

/** Charity chỉ kết thúc được khi chiến dịch đang diễn ra. */
export function canCompleteCampaign(status: CampaignStatus): boolean {
  return status === 'in_progress';
}

/** Nhãn tiếng Việt cho vai trò tình nguyện viên. */
export const ASSIGNMENT_ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao nhận / phục vụ',
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

function parseDateOnly(input?: string | Date | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  }
  const text = input.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function daysUntilUtcDate(input?: string | Date | null, ref: Date = new Date()): number | null {
  const target = parseDateOnly(input);
  const today = parseDateOnly(ref);
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function isSameUtcDate(input?: string | Date | null, ref: Date = new Date()): boolean {
  return daysUntilUtcDate(input, ref) === 0;
}

export function formatCampaignDateRange(c: { scheduledDate: string; endDate?: string | null }): string {
  const start = formatDate(c.scheduledDate);
  const end = c.endDate ? formatDate(c.endDate) : '';
  if (!end || end === start) return start;
  return `${start} đến ${end}`;
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
    { role: 'shipper' as const, label: 'Giao nhận / phục vụ', filled: c.shipperSlotsFilled, needed: c.shipperSlotsNeeded },
  ].filter((s) => s.needed > 0);
}
