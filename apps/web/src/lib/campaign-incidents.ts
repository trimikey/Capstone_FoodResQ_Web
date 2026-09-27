import type { IncidentContext } from '@/hooks/useCampaigns';

/**
 * Lý do sự cố chọn sẵn — cùng bộ mã với BE (campaign-incidents.service.ts).
 * 'other' = nhập tay, bắt buộc có mô tả.
 */
export const INCIDENT_REASONS: Record<IncidentContext, Array<{ code: string; label: string; icon: string }>> = {
  pickup: [
    { code: 'provider_closed', label: 'NCC đóng cửa / không liên lạc được', icon: 'store' },
    { code: 'provider_shortage', label: 'NCC thiếu hàng, không đủ số lượng', icon: 'inventory_2' },
    { code: 'bad_quality', label: 'Nguyên liệu kém chất lượng / hư hỏng', icon: 'sentiment_dissatisfied' },
    { code: 'vehicle_broken', label: 'Xe hỏng giữa đường', icon: 'car_crash' },
    { code: 'traffic_weather', label: 'Kẹt xe, mưa ngập — sẽ đến trễ', icon: 'thunderstorm' },
    { code: 'accident', label: 'Gặp tai nạn / va chạm', icon: 'emergency' },
    { code: 'other', label: 'Sự cố khác (nhập tay)', icon: 'edit_note' },
  ],
  distribution: [
    { code: 'food_damaged', label: 'Suất ăn bị đổ, hỏng trên đường', icon: 'no_meals' },
    { code: 'point_unavailable', label: 'Không vào được điểm phát / bị cấm tụ tập', icon: 'wrong_location' },
    { code: 'crowd_disorder', label: 'Quá đông người, mất trật tự', icon: 'groups' },
    { code: 'vehicle_broken', label: 'Xe hỏng giữa đường', icon: 'car_crash' },
    { code: 'traffic_weather', label: 'Kẹt xe, mưa ngập — sẽ đến trễ', icon: 'thunderstorm' },
    { code: 'accident', label: 'Gặp tai nạn / va chạm', icon: 'emergency' },
    { code: 'other', label: 'Sự cố khác (nhập tay)', icon: 'edit_note' },
  ],
};

export const INCIDENT_CONTEXT_LABEL: Record<IncidentContext, string> = {
  pickup: 'Lấy nguyên liệu',
  distribution: 'Phát suất ăn',
};
