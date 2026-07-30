/**
 * Bộ dữ liệu gợi ý mẫu cho form tạo chiến dịch.
 * - CA_TRUC: các ca mẫu theo từng vai trò (sơ chế / nấu / phát).
 * - LICH_TRINH: các mốc hoạt động thường gặp theo giờ.
 * - VAT_PHAM: danh sách vật phẩm / nguyên liệu cần thiết hay dùng.
 *
 * Mỗi mục có `id` để key, và các field tương ứng với state trong CreateCampaignModal.
 */

export interface ShiftTemplate {
  id: string;
  label: string;
  role?: 'chef' | 'waiter' | 'shipper';
  startTime: string;
  endTime: string;
  slotsNeeded: number;
}

export interface ScheduleTemplate {
  id: string;
  time: string;
  label: string;
}

export interface SupplyTemplate {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
}

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  // ── Sơ chế
  { id: 'shift-prep-morning', label: 'Ca sáng — Sơ chế', role: 'chef', startTime: '06:00', endTime: '08:00', slotsNeeded: 4 },
  { id: 'shift-prep-midday', label: 'Ca trưa — Sơ chế', role: 'chef', startTime: '09:00', endTime: '11:00', slotsNeeded: 3 },
  // ── Nấu
  { id: 'shift-cook-morning', label: 'Ca sáng — Nấu', role: 'chef', startTime: '07:00', endTime: '10:00', slotsNeeded: 3 },
  { id: 'shift-cook-midday', label: 'Ca trưa — Nấu', role: 'chef', startTime: '09:00', endTime: '11:30', slotsNeeded: 4 },
  { id: 'shift-cook-evening', label: 'Ca tối — Nấu', role: 'chef', startTime: '15:00', endTime: '18:00', slotsNeeded: 3 },
  // ── Phục vụ / Vận chuyển
  { id: 'shift-serve-breakfast', label: 'Phục vụ bữa sáng', role: 'waiter', startTime: '07:30', endTime: '09:30', slotsNeeded: 4 },
  { id: 'shift-serve-lunch', label: 'Phục vụ bữa trưa', role: 'waiter', startTime: '11:00', endTime: '13:30', slotsNeeded: 5 },
  { id: 'shift-serve-dinner', label: 'Phục vụ bữa tối', role: 'waiter', startTime: '17:30', endTime: '20:00', slotsNeeded: 4 },
  { id: 'shift-ship-lunch', label: 'Vận chuyển bữa trưa', role: 'shipper', startTime: '11:00', endTime: '13:30', slotsNeeded: 2 },
  { id: 'shift-ship-dinner', label: 'Vận chuyển bữa tối', role: 'shipper', startTime: '17:30', endTime: '20:00', slotsNeeded: 2 },
];

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { id: 'sch-0', time: '06:00', label: 'Tập trung tại bếp, phân công nhiệm vụ' },
  { id: 'sch-1', time: '06:30', label: 'Kiểm tra nguyên liệu, dụng cụ và thiết bị bếp' },
  { id: 'sch-2', time: '07:00', label: 'Rửa, sơ chế rau củ, vo gạo' },
  { id: 'sch-3', time: '08:00', label: 'Bắt đầu nấu các món chính' },
  { id: 'sch-4', time: '09:30', label: 'Chuẩn bị hộp/túi đựng suất ăn' },
  { id: 'sch-5', time: '10:30', label: 'Đóng gói suất, dán nhãn (nếu có)' },
  { id: 'sch-6', time: '11:00', label: 'Tập kết suất tại điểm phát' },
  { id: 'sch-7', label: '11:30', time: '11:30' } as ScheduleTemplate,
  { id: 'sch-8', time: '12:00', label: 'Bắt đầu phát suất cho người nhận' },
  { id: 'sch-9', time: '13:30', label: 'Kết thúc phát suất, dọn dẹp khu vực' },
  { id: 'sch-10', time: '14:30', label: 'Vệ sinh bếp, trả thiết bị' },
  { id: 'sch-11', time: '15:30', label: 'Họp rút kinh nghiệm, chốt số liệu' },
];

export const SUPPLY_TEMPLATES: SupplyTemplate[] = [
  // ── Nguyên liệu nấu ăn
  { id: 'sup-rice', name: 'Gạo sạch', quantity: 10, unit: 'kg' },
  { id: 'sup-vegetables', name: 'Rau củ các loại', quantity: 5, unit: 'kg' },
  { id: 'sup-meat', name: 'Thịt heo / bò', quantity: 3, unit: 'kg' },
  { id: 'sup-chicken', name: 'Thịt gà', quantity: 3, unit: 'kg' },
  { id: 'sup-fish', name: 'Cá fillet', quantity: 2, unit: 'kg' },
  { id: 'sup-eggs', name: 'Trứng gà', quantity: 30, unit: 'quả' },
  { id: 'sup-oil', name: 'Dầu ăn', quantity: 2, unit: 'lít' },
  { id: 'sup-spices', name: 'Gia vị (muối, đường, tiêu, nước mắm)', quantity: 1, unit: 'bộ' },
  // ── Vật dụng đóng gói
  { id: 'sup-box', name: 'Hộp đựng suất ăn (1 lần)', quantity: 100, unit: 'hộp' },
  { id: 'sup-bag', name: 'Túi ni-lông sạch', quantity: 1, unit: 'cuộn' },
  { id: 'sup-labels', name: 'Nhãn dán / bút ghi', quantity: 1, unit: 'bộ' },
  // ── Dụng cụ bếp
  { id: 'sup-gloves', name: 'Găng tay nilon (dùng 1 lần)', quantity: 2, unit: 'hộp' },
  { id: 'sup-apron', name: 'Tạp dề / khẩu trang', quantity: 10, unit: 'cái' },
  { id: 'sup-container', name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
  { id: 'sup-cooler', name: 'Thùng xốp / đá lạnh', quantity: 2, unit: 'thùng' },
  // ── Vật dụng phát
  { id: 'sup-table', name: 'Bàn gấp / ghế', quantity: 4, unit: 'bộ' },
  { id: 'sup-banner', name: 'Banner / standee nhận diện', quantity: 1, unit: 'cái' },
  { id: 'sup-trash', name: 'Túi rác + thùng rác', quantity: 5, unit: 'bộ' },
];
