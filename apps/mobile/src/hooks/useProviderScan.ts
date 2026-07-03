import { useMutation } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';

/** Thông tin người nhận trả về sau khi quét QR — để provider đối chiếu. */
export interface ScanResult {
  id: string;
  status: string;
  quantity: number;
  listing: { title: string; quantityUnit: string };
  receiver: {
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    faceImageUrl: string | null;
    idCardImageUrl: string | null;
    idCardNumber: string | null;
    enrolled: boolean;
  };
}

/** Quét QR đơn đặt chỗ → picked_up + trả thông tin người nhận. POST /reservations/scan */
export function useScanQr() {
  return useMutation({
    mutationFn: async (qrToken: string) => {
      const res = await apiClient.post<ApiResponse<ScanResult>>(
        endpoints.reservations.scan,
        { qrToken: qrToken.trim() }
      );
      return res.data.data;
    },
  });
}

/** Provider xác nhận đã giao đúng người → completed. POST /reservations/:id/confirm-pickup */
export function useConfirmPickup() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<{ reservationId: string; status: string }>>(
        endpoints.reservations.confirmPickup(id)
      );
      return res.data.data;
    },
  });
}
