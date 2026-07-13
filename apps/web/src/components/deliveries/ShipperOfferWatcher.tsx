'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';
import {
  useVolunteerMe,
  useActiveDelivery,
  useMyOffers,
  useOfferSocket,
  useAcceptOffer,
  useRejectOffer,
} from '@/hooks/useDeliveries';
import { OfferPopup } from '@/components/deliveries/OfferPopup';

/**
 * Lắng nghe đơn giao mới TOÀN CỤC (mount ở dashboard layout): shipper đang bật
 * sẵn sàng sẽ thấy popup nhận đơn ở BẤT KỲ trang nào, không chỉ /deliveries.
 */
export default function ShipperOfferWatcher() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isVolunteer = user?.role === UserRole.VOLUNTEER;

  const { data: me } = useVolunteerMe(isVolunteer);
  const { data: active } = useActiveDelivery(isVolunteer && !!me?.isShipper);
  const canReceive = isVolunteer && !!me?.isShipper && !!me?.isAvailable && !active;

  const { data: offers } = useMyOffers(canReceive);
  useOfferSocket(canReceive);

  const acceptOffer = useAcceptOffer();
  const rejectOffer = useRejectOffer();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const offer = canReceive
    ? offers?.find((o) => !dismissed.has(o.id) && new Date(o.expiresAt).getTime() > Date.now())
    : undefined;

  if (!offer) return null;

  return (
    <OfferPopup
      offer={offer}
      busy={acceptOffer.isPending || rejectOffer.isPending}
      onAccept={() =>
        acceptOffer.mutate(offer.deliveryId, {
          onSuccess: () => {
            toast.success('Đã nhận đơn! Bắt đầu đến lấy hàng.');
            router.push('/deliveries');
          },
          onError: () => {
            toast.error('Đơn đã được người khác nhận hoặc đã hết hạn.');
            dismiss(offer.id);
          },
        })
      }
      onReject={() => {
        rejectOffer.mutate({ deliveryId: offer.deliveryId });
        dismiss(offer.id);
      }}
      onClose={() => dismiss(offer.id)}
    />
  );
}
