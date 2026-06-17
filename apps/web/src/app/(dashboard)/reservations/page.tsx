'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useMyReservations, useCancelReservation } from '@/hooks/useReservation';

interface Reservation {
  id: string;
  status: string;
  quantity: number;
  qrToken: string | null;
  qrExpiresAt: string | null;
  receiverNotes: string | null;
  pickupProofUrl: string | null;
  pickupVerificationType: 'face' | 'id_card' | null;
  createdAt: string;
  listing: {
    title: string;
    pickupAddress: string;
    quantityUnit: string;
    provider: { businessName: string };
  };
}

export default function ReservationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Set tab based on URL param or default to 'delivery'
  const initialTab = searchParams.get('tab') || 'delivery';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  
  const { data, isLoading, isError } = useMyReservations();
  const cancelMutation = useCancelReservation();
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const reservations = (data?.items ?? []) as Reservation[];

  // Update tab if search params change
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.push(`/reservations?tab=${tab}`);
  };

  async function handleCancel(id: string) {
    try {
      await cancelMutation.mutateAsync({ id });
      toast.success('Đã hủy đặt chỗ');
      setConfirmCancel(null);
    } catch {
      toast.error('Hủy thất bại. Vui lòng thử lại.');
    }
  }

  // State simulations for Interactive Mockups
  const [deliveryStep, setDeliveryStep] = useState(3); // 3 = Đang giao
  const [pickupStep, setPickupStep] = useState(1); // 1 = Đến điểm nhận
  const [isScanning, setIsScanning] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      
      {/* Tab Switcher at the very top of content */}
      <div className="bg-white border-b border-neutral-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex space-x-8">
            <button
              onClick={() => handleTabChange('delivery')}
              className={`py-4 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                activeTab === 'delivery'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">local_shipping</span>
              Đơn hàng giao (Shipper)
            </button>
            <button
              onClick={() => handleTabChange('pickup')}
              className={`py-4 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                activeTab === 'pickup'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">storefront</span>
              Nhận hàng trực tiếp
            </button>
            <button
              onClick={() => handleTabChange('history')}
              className={`py-4 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                activeTab === 'history'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">history</span>
              Lịch sử đơn nhận ({reservations.length})
            </button>
          </div>
          
          <div className="hidden sm:block text-xs font-semibold text-neutral-400">
            CHẾ ĐỘ XEM HÌNH ẢNH MẪU FIGMA
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">

        {/* ========================================================================= */}
        {/* TAB 1: VOLUNTEER DELIVERY VIEW (IMAGE 1)                                  */}
        {/* ========================================================================= */}
        {activeTab === 'delivery' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Progress status & Route map */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Top Progress tracker */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      local_shipping
                    </span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xl text-neutral-900">Đang giao hàng</h3>
                    <p className="text-sm text-neutral-500">Tình nguyện viên đã lấy hàng và đang trên đường giao</p>
                  </div>
                </div>

                {/* Progress bar timeline */}
                <div className="mt-8 relative">
                  <div className="absolute top-[9px] left-0 right-0 h-1.5 bg-neutral-100 rounded-full z-0">
                    <div className="h-full bg-emerald-700 rounded-full transition-all" style={{ width: '66.6%' }} />
                  </div>
                  <div className="relative z-10 flex justify-between">
                    {[
                      { name: 'Đã nhận', active: true },
                      { name: 'Lấy hàng', active: true },
                      { name: 'Đang giao', active: true },
                      { name: 'Hoàn tất', active: false }
                    ].map((step, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full border-4 ${
                          step.active 
                            ? 'bg-emerald-600 border-white ring-2 ring-emerald-600' 
                            : 'bg-white border-neutral-200'
                        }`} />
                        <span className={`mt-2 font-bold text-xs ${step.active ? 'text-emerald-800' : 'text-neutral-400'}`}>
                          {step.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Map Routing Simulation */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm relative h-[360px]">
                <div className="absolute inset-0 bg-[#E8F5E9]/10">
                  {/* Simulated Map vector drawing */}
                  <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e9ebe7" strokeWidth="1.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    
                    {/* Park zones */}
                    <rect x="80" y="50" width="160" height="120" rx="10" fill="#C8E6C9" opacity="0.4" />
                    <rect x="340" y="140" width="220" height="150" rx="10" fill="#C8E6C9" opacity="0.4" />

                    {/* Streets */}
                    <line x1="-50" y1="200" x2="1000" y2="200" stroke="white" strokeWidth="24" strokeLinecap="round" />
                    <line x1="300" y1="-50" x2="300" y2="600" stroke="white" strokeWidth="24" strokeLinecap="round" />
                    <line x1="640" y1="-50" x2="640" y2="600" stroke="white" strokeWidth="24" strokeLinecap="round" />
                    <line x1="-50" y1="360" x2="1000" y2="360" stroke="white" strokeWidth="24" strokeLinecap="round" />

                    {/* Route line */}
                    <path 
                      d="M 280,200 L 300,200 L 300,360 L 620,360" 
                      fill="none" 
                      stroke="#059669" 
                      strokeWidth="6" 
                      strokeDasharray="8,6" 
                      strokeLinecap="round"
                    />

                    {/* Store Pin (Harmony) */}
                    <g transform="translate(280, 200)">
                      <circle cx="0" cy="0" r="14" fill="#047857" />
                      <path d="M-6,-4 L6,-4 L0,8 Z" fill="#047857" />
                      <circle cx="0" cy="0" r="6" fill="white" />
                    </g>
                    
                    {/* User Pin */}
                    <g transform="translate(620, 360)">
                      <circle cx="0" cy="0" r="16" fill="#DC2626" className="animate-pulse" />
                      <circle cx="0" cy="0" r="8" fill="white" />
                    </g>

                    {/* Shipper Pin */}
                    <g transform="translate(420, 360)">
                      <circle cx="0" cy="0" r="18" fill="#2563EB" />
                      <circle cx="0" cy="0" r="6" fill="white" />
                      <path d="M-4,4 L4,4 L0,-6 Z" fill="white" />
                    </g>
                  </svg>
                </div>

                <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur px-4 py-2.5 rounded-full shadow-md border border-neutral-200 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-xs font-extrabold text-neutral-800">Cách bạn khoảng 1.2km</span>
                </div>
              </div>

            </div>

            {/* Right Column: QR code, volunteer detail, food item info */}
            <div className="space-y-6">
              
              {/* QR Verification Card */}
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 shadow-sm text-center flex flex-col items-center">
                <h4 className="font-extrabold text-emerald-800 text-base">Xác nhận nhận hàng</h4>
                <p className="text-xs text-emerald-700/80 mt-1 max-w-[240px] mx-auto">
                  Quét mã của tình nguyện viên hoặc đưa mã này cho họ để hoàn tất
                </p>

                {/* Simulated screen showing QR */}
                <div className="my-5 p-4 bg-white border border-emerald-100 rounded-2xl shadow-inner flex flex-col items-center">
                  <div className="border-4 border-neutral-800 rounded-xl overflow-hidden p-2.5 bg-neutral-900 flex flex-col items-center w-[160px]">
                    <div className="w-full text-[8px] text-white/50 text-center mb-1">MÃ XÁC NHẬN</div>
                    <div className="bg-white p-2 rounded-lg">
                      <QRCodeSVG value="shipper-verify-mock-id-12345" size={100} level="M" />
                    </div>
                    <div className="w-full text-[8px] text-emerald-400 font-bold text-center mt-1.5">#RESQ-8821</div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    toast.success('Bật camera quét mã QR của tình nguyện viên thành công!');
                    setDeliveryStep(4);
                  }}
                  className="w-full py-3 bg-emerald-800 hover:bg-emerald-950 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                  Quét mã của Tình nguyện viên
                </button>
              </div>

              {/* Volunteer profile detail card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Người vận chuyển</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop" 
                      alt="Avatar" 
                      className="w-12 h-12 rounded-full object-cover border border-neutral-100" 
                    />
                    <div>
                      <h5 className="font-extrabold text-neutral-800">Minh Tâm</h5>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-neutral-500 font-medium">
                        <span className="material-symbols-outlined text-[14px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span className="font-bold">4.9</span>
                        <span className="text-neutral-300">•</span>
                        <span>120 lượt giúp</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a 
                      href="tel:0987654321"
                      className="w-10 h-10 rounded-full border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-600 transition-colors"
                      title="Gọi điện"
                    >
                      <span className="material-symbols-outlined text-[20px]">call</span>
                    </a>
                    <button 
                      onClick={() => toast.info('Tính năng trò chuyện trực tuyến sắp ra mắt!')}
                      className="w-10 h-10 rounded-full border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-600 transition-colors"
                      title="Nhắn tin"
                    >
                      <span className="material-symbols-outlined text-[20px]">chat</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Listing detail card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Chi tiết thực phẩm</h4>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
                    <img 
                      src="/banh-mi-ngot-thap-cam.png" 
                      alt="Food" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-neutral-800 truncate">Gói Bánh Mì & Bơ</h5>
                    <p className="text-xs text-neutral-500 mt-0.5">Từ: Tiệm bánh Harmony</p>
                    <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                      Đã đóng gói
                    </span>
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-3 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Mã đơn hàng:</span>
                    <span className="font-bold text-neutral-800">#RESQ-8821</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Dự kiến giao:</span>
                    <span className="font-bold text-emerald-700">10-15 phút nữa</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RECEIVER DIRECT PICKUP VIEW (IMAGE 2)                               */}
        {/* ========================================================================= */}
        {activeTab === 'pickup' && (
          <div>
            
            {/* Steps indicator at the top */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-6 shadow-sm flex items-center justify-center gap-8 max-w-2xl mx-auto">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs shadow-md">
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                </div>
                <span className="text-sm font-bold text-emerald-800">Đến điểm nhận</span>
              </div>
              <div className="h-[2px] w-24 bg-emerald-700 rounded-full" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  pickupStep === 2 ? 'bg-emerald-800 text-white shadow-md animate-bounce' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                </div>
                <span className={`text-sm font-bold ${pickupStep === 2 ? 'text-emerald-800' : 'text-neutral-450'}`}>Xác nhận thành công</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Direct Camera Live Scan view */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Camera card */}
                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-lg text-neutral-800">Xác nhận Nhận hàng Trực tiếp</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">Quét mã QR của Nhà cung cấp để xác thực</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                      BƯỚC {pickupStep}/2
                    </span>
                  </div>

                  {/* Camera view screen */}
                  <div className="bg-neutral-900 aspect-video relative flex items-center justify-center group overflow-hidden">
                    
                    {pickupStep === 1 ? (
                      <>
                        {/* Mock camera live background */}
                        <div className="absolute inset-0 bg-cover bg-center opacity-70 filter blur-[0.5px]" style={{
                          backgroundImage: "url('https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=800&auto=format&fit=crop')"
                        }} />

                        {/* Scanner square border */}
                        <div className="relative w-64 h-64 border-2 border-emerald-500 rounded-2xl z-10 flex items-center justify-center shadow-[0_0_80px_rgba(16,185,129,0.3)]">
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500 animate-bounce" />
                          <div className="w-24 h-24 bg-white p-2.5 rounded-lg border border-neutral-300 flex items-center justify-center opacity-90">
                            <QRCodeSVG value="provider-mock-qr-code" size={80} level="M" />
                          </div>

                          {/* Corners */}
                          <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-emerald-600 rounded-tl-md" />
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-emerald-600 rounded-tr-md" />
                          <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-emerald-600 rounded-bl-md" />
                          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-emerald-600 rounded-br-md" />
                        </div>

                        {/* Centered instruction text */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur px-5 py-2.5 rounded-full z-20 flex items-center gap-2 border border-white/10 text-white max-w-[90%]">
                          <span className="material-symbols-outlined text-[16px] text-emerald-400">info</span>
                          <span className="text-xs font-semibold">Đưa mã QR của Nhà cung cấp vào khung</span>
                        </div>

                        {/* Simulated trigger hover action */}
                        <div className="absolute inset-0 bg-black/20 hover:bg-black/40 transition-all flex items-center justify-center cursor-pointer" onClick={() => {
                          setIsScanning(true);
                          toast.info('Đang xác minh mã QR nhà cung cấp...');
                          setTimeout(() => {
                            setIsScanning(false);
                            setPickupStep(2);
                            toast.success('Nhận hàng trực tiếp thành công! +2 Điểm uy tín');
                          }, 1500);
                        }}>
                          <div className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-full text-xs font-bold transition-all shadow-md flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                            <span>Mô phỏng Quét mã QR</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Success state */
                      <div className="absolute inset-0 bg-emerald-950/95 flex flex-col items-center justify-center text-center p-6 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center animate-bounce shadow-lg">
                          <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xl text-white">XÁC THỰC THÀNH CÔNG</h4>
                          <p className="text-xs text-emerald-300 mt-1">
                            Cảm ơn bạn đã giải cứu thực phẩm dư thừa cùng FoodResQ!
                          </p>
                        </div>
                        <div className="bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-3 text-white text-xs max-w-sm">
                          <span className="material-symbols-outlined text-amber-400 text-[24px]">verified</span>
                          <div className="text-left">
                            <p className="font-bold text-amber-400">+2 Điểm Uy Tín</p>
                            <p className="text-[10px] text-neutral-300">Điểm uy tín của bạn đã được cập nhật thành công</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setPickupStep(1)}
                          className="px-6 py-2.5 bg-white text-emerald-900 rounded-xl text-xs font-bold shadow-md hover:bg-neutral-100 transition-all"
                        >
                          Quét lại
                        </button>
                      </div>
                    )}

                  </div>

                  {/* Below camera info panels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-100 bg-neutral-50/50">
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">storefront</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-450 font-bold uppercase tracking-wider">Nhà cung cấp</p>
                        <p className="text-xs font-bold text-neutral-800">Tiệm Bánh An Nhiên</p>
                      </div>
                    </div>
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">location_on</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-450 font-bold uppercase tracking-wider">Địa chỉ lấy</p>
                        <p className="text-xs font-bold text-neutral-800 truncate max-w-[240px]">123 Đường Lê Lợi, Quận 1</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Listing items details, progress metric card, merchant profiles */}
              <div className="space-y-6">
                
                {/* Food bag card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                    <h4 className="font-extrabold text-sm">Chi tiết túi thực phẩm #RQ-882</h4>
                  </div>
                  
                  <div className="divide-y divide-neutral-100 text-xs">
                    {[
                      { name: 'Bánh mì tươi (6 cái)', qty: 1 },
                      { name: 'Sữa tươi thanh trùng', qty: 2 },
                      { name: 'Trái cây tổng hợp', qty: 1 }
                    ].map((item, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between text-neutral-600">
                        <span>{item.name}</span>
                        <span className="font-bold text-neutral-800">x{item.qty}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-neutral-100 pt-3 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Trọng lượng ước tính:</span>
                    <span className="font-black text-neutral-800">~2.5 kg</span>
                  </div>
                </div>

                {/* Progress gamified metric card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-3">
                  <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">BẠN ĐANG LÀM RẤT TỐT!</p>
                  <h4 className="font-extrabold text-sm text-neutral-850">Tiến độ giải cứu thực phẩm</h4>
                  
                  <div className="space-y-1">
                    <div className="h-3 w-full bg-emerald-50 rounded-full overflow-hidden border border-emerald-100">
                      <div className="h-full bg-emerald-700 rounded-full transition-all" style={{ width: pickupStep === 2 ? '78%' : '73%' }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-450 font-bold">
                      <span>36.5 kg đã cứu</span>
                      <span>Mục tiêu: 50 kg</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-500 font-medium">
                    Giao đơn này để đạt mốc 50kg trong tháng!
                  </p>
                </div>

                {/* Merchant detail card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-neutral-400 uppercase tracking-wider text-[10px] font-bold">
                    <span className="material-symbols-outlined text-[16px]">storefront</span>
                    <span>Thông tin Nhà cung cấp</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="text-neutral-400 text-[10px]">Tên cửa hàng</p>
                      <p className="font-bold text-neutral-800">Tiệm Bánh An Nhiên</p>
                    </div>
                    <div>
                      <p className="text-neutral-400 text-[10px]">Địa chỉ nhận hàng</p>
                      <p className="font-semibold text-neutral-700 leading-normal">123 Đường Lê Lợi, Quận 1, TP. HCM</p>
                    </div>
                    <div>
                      <p className="text-neutral-400 text-[10px]">Giờ mở cửa</p>
                      <p className="font-bold text-emerald-700">08:00 - 21:00</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('123 Đường Lê Lợi, Quận 1, TP. HCM')}`, '_blank')}
                    className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">explore</span>
                    Chỉ đường
                  </button>
                </div>

              </div>

            </div>

            {/* Floating Action Button */}
            <div className="fixed bottom-6 right-6 z-40">
              <button 
                onClick={() => {
                  toast.info('Đang liên hệ khẩn cấp đến tổng đài cứu trợ FoodResQ...');
                  window.location.href = 'tel:19001000';
                }}
                className="bg-emerald-900 hover:bg-emerald-950 text-white px-5 py-3 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 transition-all hover:scale-105"
              >
                <span className="material-symbols-outlined text-[18px]">contact_support</span>
                <span>Hỗ trợ khẩn cấp</span>
              </button>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: RESERVATION HISTORY LIST (LIVE DB DATA)                            */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            
            {/* Header section */}
            <div>
              <h2 className="font-extrabold text-xl text-neutral-900">Lịch sử đặt chỗ</h2>
              <p className="text-sm text-neutral-500 mt-1">Danh sách tất cả các thực phẩm đã nhận và lịch sử đặt chỗ trên hệ thống.</p>
            </div>

            {/* Error or Empty states */}
            {isError && (
              <div className="text-center py-12 bg-white rounded-2xl border border-neutral-200">
                <span className="material-symbols-outlined text-red-500 text-[48px]">wifi_off</span>
                <p className="font-bold text-neutral-700 mt-2">Không thể tải dữ liệu từ máy chủ</p>
                <p className="text-xs text-neutral-450 mt-1">Vui lòng kiểm tra lại kết nối mạng hoặc server API</p>
              </div>
            )}

            {!isLoading && !isError && reservations.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-neutral-200">
                <span className="material-symbols-outlined text-neutral-300 text-[64px]">bookmark_border</span>
                <h3 className="font-extrabold text-lg text-neutral-800 mt-4">Chưa có lịch sử đặt chỗ nào</h3>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">
                  Hãy quay lại trang chủ tìm thực phẩm và tiến hành cứu trợ ngay hôm nay.
                </p>
              </div>
            )}

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reservations.map((r) => {
                const isConfirmed = r.status === 'confirmed';
                return (
                  <div key={r.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-neutral-800 leading-snug">{r.listing.title}</h4>
                          <p className="text-xs text-neutral-500 mt-0.5">{r.listing.provider.businessName}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          r.status === 'confirmed' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          r.status === 'picked_up' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          r.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-neutral-100 text-neutral-500'
                        }`}>
                          {r.status === 'confirmed' ? 'Đã xác nhận' :
                           r.status === 'picked_up' ? 'Đã lấy hàng' :
                           r.status === 'completed' ? 'Hoàn tất' : r.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                          {r.quantity} phần
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">place</span>
                          <span className="truncate max-w-[150px]">{r.listing.pickupAddress}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                          {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-neutral-100 pt-3 mt-4 flex items-center justify-between">
                      {isConfirmed ? (
                        <>
                          <button
                            onClick={() => setExpandedQR(expandedQR === r.id ? null : r.id)}
                            className="text-emerald-800 font-bold text-xs hover:underline flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">qr_code</span>
                            {expandedQR === r.id ? 'Ẩn mã QR' : 'Xem mã QR nhận hàng'}
                          </button>

                          {confirmCancel === r.id ? (
                            <div className="flex gap-2">
                              <button onClick={() => handleCancel(r.id)} className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-[10px] font-bold">Hủy</button>
                              <button onClick={() => setConfirmCancel(null)} className="px-2.5 py-1 border border-neutral-200 rounded-lg text-[10px]">Không</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmCancel(r.id)} className="text-red-500 font-medium text-xs hover:underline">
                              Hủy đặt chỗ
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-400 text-xs">Đơn hàng không thể thay đổi</span>
                      )}
                    </div>

                    {expandedQR === r.id && r.qrToken && (
                      <div className="mt-4 p-4 border border-emerald-100 bg-emerald-50/50 rounded-xl flex flex-col items-center gap-2">
                        <div className="bg-white p-2.5 rounded-lg border border-neutral-200 shadow-sm">
                          <QRCodeSVG value={r.qrToken} size={120} level="M" />
                        </div>
                        <p className="text-[10px] text-neutral-500">Mã QR dùng để xác thực bàn giao tại quán</p>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
