import { z } from 'zod';

export const createReservationSchema = z.object({
  listingId: z.string().uuid(),
  quantity: z.number().positive().max(10),
  receiverNotes: z.string().max(500).optional(),
  requestDelivery: z.boolean().optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// Xác minh danh tính khi nhận hàng — mirror SubmitPickupProofDto (BE)
export const pickupVerificationSchema = z.object({
  verificationType: z.enum(['face', 'id_card']),
});

export type PickupVerificationInput = z.infer<typeof pickupVerificationSchema>;
