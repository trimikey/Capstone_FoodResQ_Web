import type { DeliveryStatus } from '@/hooks/useDeliveries';

export interface DeliveryStatusMeta {
  label: string;
  color: string;
  bg: string;
}

const META: Record<string, DeliveryStatusMeta> = {
  pending_assignment: { label: 'Chờ nhận', color: '#b45309', bg: '#fef3c7' },
  assigned: { label: 'Đã nhận đơn', color: '#4338ca', bg: '#eef2ff' },
  heading_to_provider: { label: 'Đang tới lấy hàng', color: '#0369a1', bg: '#e0f2fe' },
  qc_completed: { label: 'Đã lấy hàng (QC)', color: '#15803d', bg: '#dcfce7' },
  in_transit: { label: 'Đang giao đến', color: '#0d9488', bg: '#ccfbf1' },
  delivered: { label: 'Đã giao thành công', color: '#15803d', bg: '#dcfce7' },
  failed: { label: 'Giao thất bại', color: '#b91c1c', bg: '#fee2e2' },
};

const FALLBACK: DeliveryStatusMeta = { label: 'Không rõ', color: '#6b7280', bg: '#f3f4f6' };

export function deliveryStatusMeta(status?: string | null): DeliveryStatusMeta {
  return (status && META[status]) || FALLBACK;
}

export function deliveryStatusLabel(status?: string | null): string {
  return deliveryStatusMeta(status).label;
}

export const DELIVERY_STEP_ORDER: DeliveryStatus[] = [
  'pending_assignment',
  'assigned',
  'heading_to_provider',
  'qc_completed',
  'in_transit',
  'delivered',
];

export const DELIVERY_STEPS: { key: DeliveryStatus; label: string }[] = [
  { key: 'assigned', label: 'Đã nhận đơn' },
  { key: 'heading_to_provider', label: 'Tới lấy hàng' },
  { key: 'qc_completed', label: 'Đã lấy hàng' },
  { key: 'in_transit', label: 'Đang giao' },
  { key: 'delivered', label: 'Hoàn tất' },
];

const NEXT: Record<string, DeliveryStatus> = {
  assigned: 'heading_to_provider',
  heading_to_provider: 'qc_completed',
  qc_completed: 'in_transit',
  in_transit: 'delivered',
};

export function nextDeliveryStatus(status?: string | null): DeliveryStatus | null {
  return (status && NEXT[status]) || null;
}

export function requiresQcPhoto(nextStatus: DeliveryStatus): boolean {
  return nextStatus === 'qc_completed';
}
