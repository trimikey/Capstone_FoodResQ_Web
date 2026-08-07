import type { ReactNode } from 'react';
import ShipperSidebar from './_components/ShipperSidebar';

/**
 * Vỏ chung cho khu vực giao hàng: sidebar cố định bên trái trên màn lớn.
 *
 * Layout dashboard chừa 104px dưới header bằng padding và dải đó mang nền kem của
 * dashboard. Kéo ngược lên rồi bù lại padding để nền của khu giao hàng phủ kín,
 * không để lộ vệt màu lạ giữa header và nội dung.
 */
export default function DeliveriesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 md:-mt-[104px] md:pt-[104px]">
      <ShipperSidebar />
      <div className="lg:ml-56">{children}</div>
    </div>
  );
}
