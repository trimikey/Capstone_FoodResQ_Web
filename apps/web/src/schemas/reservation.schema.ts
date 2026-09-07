import { z } from 'zod';

export const createReservationSchema = z.object({
  listingId: z.string().uuid(),
  quantity: z.number().positive().max(10),
  receiverNotes: z.string().max(500).optional(),
  requestDelivery: z.boolean().optional(),
  /** Ảnh bằng chứng khó di chuyển — bắt buộc khi requestDelivery (BE chặn nếu thiếu). */
  deliveryEvidenceUrl: z.string().max(2048).optional(),
  /** Điểm giao riêng cho đơn này. Bỏ trống = giao về địa chỉ trong hồ sơ. */
  deliveryLng: z.number().min(-180).max(180).optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryAddress: z.string().max(500).optional(),
  /** Giờ hẹn giao (ISO). Bỏ trống = giao ngay. */
  deliveryScheduledAt: z.string().optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// Xác minh danh tính khi nhận hàng — mirror SubmitPickupProofDto (BE)
export const pickupVerificationSchema = z.object({
  verificationType: z.enum(['face', 'id_card']),
});

export type PickupVerificationInput = z.infer<typeof pickupVerificationSchema>;
