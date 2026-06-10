import { z } from 'zod';

export const createReservationSchema = z.object({
  listingId: z.string().uuid(),
  quantity: z.number().positive().max(10),
  receiverNotes: z.string().max(500).optional(),
  requestDelivery: z.boolean().optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
