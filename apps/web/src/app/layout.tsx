import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/app/providers';

export const metadata: Metadata = {
  // metadataBase để các URL tương đối (og:image…) tự thành URL tuyệt đối khi render
  metadataBase: new URL('https://capstone-food-res-q-web-web.vercel.app'),
  title: {
    default: 'FoodResQ — Giải cứu thực phẩm, kết nối cộng đồng',
    // Trang con đặt title riêng sẽ tự thành "Tên trang | FoodResQ"
    template: '%s | FoodResQ',
  },
  description:
    'Nền tảng kết nối cửa hàng có thực phẩm dư với người cần và bếp ăn cộng đồng — '
    + 'đặt phần 0đ, tình nguyện viên giao tận nơi, minh bạch từng suất ăn.',
  // Open Graph: share link qua Zalo/Messenger/Facebook ra card có ảnh + mô tả
  // thay vì một dòng link trơ trọi — quan trọng khi gửi demo cho hội đồng.
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: 'FoodResQ',
    title: 'FoodResQ — Giải cứu thực phẩm, kết nối cộng đồng',
    description:
      'Đặt phần ăn 0đ từ thực phẩm dư còn tốt, tình nguyện viên giao tận nơi, '
      + 'bếp ăn cộng đồng minh bạch từng suất.',
    images: [{ url: '/anhbanner1.jpg', width: 1200, height: 630, alt: 'FoodResQ — bếp ăn cộng đồng' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-surface font-body-md text-on-surface" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

