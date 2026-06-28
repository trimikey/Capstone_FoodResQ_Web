import { useQuery } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';

export type DeliveryStatus =
  | 'pending_assignment'
  | 'assigned'
  | 'heading_to_provider'
  | 'qc_completed'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | (string & {});

export interface DeliveryTracking {
  status: DeliveryStatus;
  distanceKm: number | null;
  listingTitle: string;
  pickupAddress: string;
  coords: unknown;
  shipper: {
    name: string;
    phone: string | null;
    location: { lng: number; lat: number } | null;
  } | null;
}

/**
 * Theo dõi đơn giao tận nơi (receiver). GET /deliveries/track/:reservationId
 * Poll mỗi 15s để cập nhật trạng thái + vị trí shipper (backend pull-based).
 */
export function useDeliveryTracking(reservationId?: string, enabled = true) {
  return useQuery({
    queryKey: ['delivery-tracking', reservationId],
    enabled: !!reservationId && enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DeliveryTracking>>(
        endpoints.deliveries.track(reservationId!)
      );
      return res.data.data;
    },
  });
}
