'use client';

import PublicHeader from '@/components/home/PublicHeader';
import HomeContent from '@/components/home/HomeContent';

// Trang chủ công khai (root /) — KHÔNG yêu cầu đăng nhập.
// Khách xem thoải mái; các thao tác cần auth (đặt hàng) sẽ tự chuyển sang /login.
export default function RootHomePage() {
  return (
    <>
      <PublicHeader />
      <HomeContent />
    </>
  );
}
