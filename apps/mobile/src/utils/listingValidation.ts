import type { FieldErrors } from 'react-hook-form';
import type { CreateListingFormInput } from './validators';

const FIELD_LABELS: Partial<Record<keyof CreateListingFormInput, string>> = {
  title: 'Tiêu đề',
  categories: 'Loại thực phẩm',
  categoryOtherLabel: 'Mô tả loại khác',
  quantityTotal: 'Số lượng',
  quantityUnit: 'Đơn vị',
  maxPerReservation: 'Tối đa mỗi lượt',
  pickupStartTime: 'Giờ bắt đầu lấy',
  pickupEndTime: 'Giờ kết thúc lấy',
  expiryTime: 'Hạn sử dụng',
  pickupAddress: 'Địa chỉ lấy hàng',
  description: 'Mô tả',
  weightPerUnitKg: 'Khối lượng/phần',
  storageConditions: 'Điều kiện bảo quản',
  allergenNotes: 'Lưu ý dị ứng',
};

export function buildValidationMessage(
  errors: FieldErrors<CreateListingFormInput>,
): string {
  const lines = (Object.keys(errors) as Array<keyof CreateListingFormInput>)
    .map((field) => {
      const label = FIELD_LABELS[field] ?? String(field);
      const message = (errors[field] as { message?: string } | undefined)?.message;
      return message ? `• ${label}: ${message}` : null;
    })
    .filter((line): line is string => line !== null);

  return lines.join('\n');
}
