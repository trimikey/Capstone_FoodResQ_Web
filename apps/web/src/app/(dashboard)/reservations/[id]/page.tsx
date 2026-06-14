'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useReservationDetails, useSubmitPickupProof } from '@/hooks/useReservation';

export default function ReservationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: fetchedData, isLoading, isError } = useReservationDetails(id);
  const submitProofMutation = useSubmitPickupProof();

  // Mode and state simulations
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [currentStep, setCurrentStep] = useState(1); // 1 = in progress, 2 = success
  const [isScanning, setIsScanning] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'shipper', text: 'Chào bạn, mình đã nhận đơn cứu trợ của bạn rồi nhé!' },
    { sender: 'shipper', text: 'Đang chuẩn bị lấy bánh từ Tiệm bánh Harmony.' },
  ]);

  // Handle fallback or fetched data determination
  const isMock = id.startsWith('demo-') || id.startsWith('mock-') || isError || !fetchedData;

  // Sync deliveryMethod based on database response
  useEffect(() => {
    if (fetchedData) {
      // If delivery relation exists, it's a volunteer delivery
      if (fetchedData.delivery) {
        setDeliveryMethod('delivery');
      } else {
        setDeliveryMethod('pickup');
      }
    } else {
      // Default mock based on ID format
      if (id.includes('pickup') || id.includes('An-Nhien') || id.includes('An_Nhien') || id.includes('rq-') || id.includes('RQ-')) {
        setDeliveryMethod('pickup');
      } else {
        setDeliveryMethod('delivery');
      }
    }
  }, [fetchedData, id]);

  if (isLoading && !isMock) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] bg-surface gap-md">
        <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-10 h-10" />
        <p className="font-body-md text-on-surface-variant">Đang tải thông tin đơn nhận...</p>
      </div>
    );
  }

  // --- MOCK DATA ---
  const mockListing = {
    title: deliveryMethod === 'delivery' ? 'Gói Bánh Mì & Bơ' : 'Gói Bánh Mì Dinh Dưỡng',
    providerName: deliveryMethod === 'delivery' ? 'Tiệm bánh Harmony' : 'Tiệm Bánh An Nhiên',
    providerAddress: deliveryMethod === 'delivery' ? '456 Đường Láng, Đống Đa, Hà Nội' : '123 Đường Lê Lợi, Quận 1, TP. HCM',
    providerPhone: '0912345678',
    orderId: deliveryMethod === 'delivery' ? '#RESQ-8821' : '#RQ-882',
    imageUrl: deliveryMethod === 'delivery' ? '/banh-mi-ngot-thap-cam.png' : '/banh-mi-lua-mach-tuoi.png',
  };

  const reservation = fetchedData || {
    id,
    quantity: 1,
    status: currentStep === 2 ? 'completed' : (deliveryMethod === 'delivery' ? 'picked_up' : 'confirmed'),
    qrToken: 'mock-qr-token-12345',
    qrExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    listing: {
      title: mockListing.title,
      pickupAddress: mockListing.providerAddress,
      quantityUnit: 'phần',
      imageUrls: [mockListing.imageUrl],
      provider: {
        businessName: mockListing.providerName,
        contactPhone: mockListing.providerPhone,
        address: mockListing.providerAddress,
        avgRating: 4.8,
      }
    },
    delivery: deliveryMethod === 'delivery' ? {
      status: currentStep === 2 ? 'delivered' : 'picked_up',
      shipper: {
        user: {
          fullName: 'Minh Tâm',
          phone: '0987654321',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop',
        }
      }
    } : null
  };

  // Actions
  const handleCallShipper = (name: string, phone: string) => {
    toast.success(`Đang kết nối cuộc gọi đến ${name}: ${phone}`);
  };

  const handleSimulateScan = () => {
    setIsScanning(true);
    toast.info('Đang bật camera mô phỏng quét mã QR...');
    
    setTimeout(() => {
      setIsScanning(false);
      setCurrentStep(2);
      toast.success('Xác nhận nhận thực phẩm thành công!');
    }, 2000);
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    setChatHistory([...chatHistory, { sender: 'receiver', text: chatMessage }]);
    setChatMessage('');
    
    // Simulate automated reply
    setTimeout(() => {
      setChatHistory(prev => [...prev, { sender: 'shipper', text: 'Dạ vâng ạ, mình đang di chuyển rồi.' }]);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      {/* Top Breadcrumb Navigation */}
      <div className="bg-white border-b border-neutral-200 py-3 px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-xs text-xs font-medium text-neutral-500">
          <Link href="/listings" className="hover:text-primary transition-colors">Tìm thực phẩm</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <Link href="/reservations" className="hover:text-primary transition-colors">Đơn hàng của tôi</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-neutral-800 font-semibold">{reservation.listing.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* ========================================================================= */}
        {/* LAYOUT A: VOLUNTEER DELIVERY VIEW (IMAGE 1)                               */}
        {/* ========================================================================= */}
        {deliveryMethod === 'delivery' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Progress tracker & Map route */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Delivery Progress Bar Card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      local_shipping
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-neutral-900">
                      {currentStep === 2 ? 'Đã giao thành công' : 'Đang giao hàng'}
                    </h3>
                    <p className="text-sm text-neutral-500">
                      {currentStep === 2 
                        ? 'Cảm ơn bạn đã đồng hành cứu trợ thực phẩm cùng FoodResQ!'
                        : 'Tình nguyện viên đã lấy hàng và đang trên đường giao'
                      }
                    </p>
                  </div>
                </div>

                {/* Progress Steps Timeline */}
                <div className="mt-8 relative">
                  {/* Timeline Horizontal Line */}
                  <div className="absolute top-[9px] left-0 right-0 h-1 bg-neutral-100 rounded-full z-0">
                    <div 
                      className="h-full bg-emerald-600 rounded-full transition-all duration-500" 
                      style={{ width: currentStep === 2 ? '100%' : '66.6%' }}
                    />
                  </div>

                  {/* Step Nodes */}
                  <div className="relative z-10 flex justify-between">
                    {[
                      { label: 'Đã nhận', desc: 'Đã đặt đơn' },
                      { label: 'Lấy hàng', desc: 'Đã nhận bánh' },
                      { label: 'Đang giao', desc: 'Đang vận chuyển' },
                      { label: 'Hoàn tất', desc: 'Giao thành công' }
                    ].map((step, idx) => {
                      const isCompleted = idx <= (currentStep === 2 ? 3 : 2);
                      const isActive = idx === (currentStep === 2 ? 3 : 2);
                      return (
                        <div key={idx} className="flex flex-col items-center">
                          <div className={`w-5 h-5 rounded-full border-4 ${
                            isCompleted 
                              ? 'bg-emerald-600 border-white ring-2 ring-emerald-600' 
                              : 'bg-white border-neutral-200'
                          } transition-all duration-300`} />
                          <span className={`mt-2 font-bold text-xs ${isCompleted ? 'text-emerald-700' : 'text-neutral-400'}`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Map Route Tracking Card */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm relative h-[360px]">
                {/* SVG Simulated Map Canvas */}
                <div className="absolute inset-0 bg-neutral-100 flex items-center justify-center">
                  <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    {/* Background Grid Pattern */}
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e5e5" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Parks & Green zones */}
                    <rect x="150" y="80" width="220" height="90" rx="15" fill="#C8E6C9" opacity="0.6" />
                    <rect x="420" y="220" width="180" height="100" rx="15" fill="#C8E6C9" opacity="0.6" />

                    {/* Streets Roads */}
                    <line x1="-50" y1="180" x2="900" y2="180" stroke="white" strokeWidth="24" strokeLinecap="round" />
                    <line x1="300" y1="-50" x2="300" y2="500" stroke="white" strokeWidth="24" strokeLinecap="round" />
                    <line x1="600" y1="-50" x2="600" y2="500" stroke="white" strokeWidth="24" strokeLinecap="round" />
                    <line x1="-50" y1="320" x2="900" y2="320" stroke="white" strokeWidth="24" strokeLinecap="round" />

                    {/* Route line */}
                    <path 
                      d="M 280,180 L 300,180 L 300,320 L 580,320" 
                      fill="none" 
                      stroke="#059669" 
                      strokeWidth="6" 
                      strokeDasharray="8,6" 
                      strokeLinecap="round"
                    />

                    {/* Store Pin (Harmony) */}
                    <g transform="translate(280, 180)">
                      <circle cx="0" cy="0" r="14" fill="#047857" />
                      <path d="M-6,-4 L6,-4 L0,8 Z" fill="#047857" />
                      <circle cx="0" cy="0" r="6" fill="white" />
                    </g>
                    
                    {/* User Pin */}
                    <g transform="translate(580, 320)">
                      <circle cx="0" cy="0" r="16" fill="#DC2626" className="animate-pulse" />
                      <circle cx="0" cy="0" r="8" fill="white" />
                    </g>

                    {/* Shipper Pin */}
                    <g transform={`translate(${currentStep === 2 ? 580 : 380}, 320)`} className="transition-all duration-[2000ms]">
                      <circle cx="0" cy="0" r="18" fill="#2563EB" />
                      <circle cx="0" cy="0" r="6" fill="white" />
                      <path d="M-4,4 L4,4 L0,-6 Z" fill="white" />
                    </g>
                  </svg>
                </div>

                {/* Overlaid Information Badge */}
                <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur px-4 py-2.5 rounded-full shadow-md border border-neutral-200 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
                  <span className="text-xs font-bold text-neutral-800">
                    {currentStep === 2 ? 'Đã giao tới vị trí của bạn' : 'Tình nguyện viên cách bạn khoảng 1.2km'}
                  </span>
                </div>
              </div>

            </div>

            {/* Right Column: QR verify, Volunteer info, Listing info */}
            <div className="space-y-6">
              
              {/* QR Verification Confirmation Card */}
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 shadow-sm text-center flex flex-col items-center">
                <h4 className="font-bold text-emerald-800 text-md">Xác nhận nhận hàng</h4>
                <p className="text-xs text-emerald-700/80 mt-1 max-w-[240px] mx-auto">
                  Quét mã của tình nguyện viên hoặc đưa mã này cho họ để hoàn tất
                </p>

                {/* Phone QR frame container */}
                <div className="my-5 p-4 bg-white border border-emerald-100 rounded-2xl shadow-inner flex flex-col items-center gap-3">
                  <div className="border-4 border-neutral-800 rounded-xl overflow-hidden p-2.5 bg-neutral-900 flex flex-col items-center w-[160px] h-[190px]">
                    <div className="w-full text-[8px] text-white/50 text-center mb-1">MÃ XÁC NHẬN</div>
                    <div className="flex-1 flex items-center justify-center bg-white p-2 rounded-lg">
                      <QRCodeSVG value={reservation.qrToken!} size={100} level="M" />
                    </div>
                    <div className="w-full text-[8px] text-emerald-400 font-bold text-center mt-1.5">{reservation.listing.orderId || '#RESQ-8821'}</div>
                  </div>
                </div>

                {/* QR Scanner Trigger Button */}
                <button 
                  onClick={handleSimulateScan}
                  disabled={currentStep === 2}
                  className="w-full py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                  Quét mã của Tình nguyện viên
                </button>
              </div>

              {/* Volunteer Shipper Details Card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Người vận chuyển</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src={reservation.delivery?.shipper?.user?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop"} 
                      alt="Avatar" 
                      className="w-12 h-12 rounded-full object-cover border border-neutral-100" 
                    />
                    <div>
                      <h5 className="font-bold text-neutral-800">{reservation.delivery?.shipper?.user?.fullName || 'Minh Tâm'}</h5>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-neutral-500 font-medium">
                        <span className="material-symbols-outlined text-[14px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span>4.9</span>
                        <span className="text-neutral-300">•</span>
                        <span>120 lượt giúp</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleCallShipper(reservation.delivery?.shipper?.user?.fullName || 'Minh Tâm', reservation.delivery?.shipper?.user?.phone || '0987654321')}
                      className="w-10 h-10 rounded-full border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-600 transition-colors"
                      title="Gọi điện thoại"
                    >
                      <span className="material-symbols-outlined text-[20px]">call</span>
                    </button>
                    <button 
                      onClick={() => setIsChatOpen(true)}
                      className="w-10 h-10 rounded-full border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-600 transition-colors relative"
                      title="Nhắn tin"
                    >
                      <span className="material-symbols-outlined text-[20px]">chat</span>
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-600 rounded-full ring-2 ring-white" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Listing Details Summary Card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Chi tiết thực phẩm</h4>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
                    <img 
                      src={reservation.listing.imageUrls?.[0] || "/banh-mi-ngot-thap-cam.png"} 
                      alt="Food" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-neutral-800 truncate">{reservation.listing.title}</h5>
                    <p className="text-xs text-neutral-500 mt-0.5">Từ: {reservation.listing.provider.businessName}</p>
                    <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                      Đã đóng gói
                    </span>
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-3 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Mã đơn hàng:</span>
                    <span className="font-bold text-neutral-800">{reservation.listing.orderId || '#RESQ-8821'}</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Dự kiến giao:</span>
                    <span className="font-bold text-emerald-700">
                      {currentStep === 2 ? 'Đã hoàn thành' : '10-15 phút nữa'}
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* LAYOUT B: RECEIVER DIRECT PICKUP VIEW (IMAGE 2)                         */}
        {/* ========================================================================= */}
        {deliveryMethod === 'pickup' && (
          <div>
            
            {/* Top Indicator Header (Đến điểm nhận -> Xác nhận thành công) */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-6 shadow-sm flex items-center justify-center gap-8 max-w-2xl mx-auto">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  currentStep === 1 ? 'bg-emerald-800 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                </div>
                <span className={`text-sm font-bold ${currentStep === 1 ? 'text-neutral-800' : 'text-neutral-400'}`}>Đến điểm nhận</span>
              </div>
              <div className="h-[2px] w-24 bg-neutral-200 rounded-full" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  currentStep === 2 ? 'bg-emerald-800 text-white animate-bounce' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                </div>
                <span className={`text-sm font-bold ${currentStep === 2 ? 'text-neutral-800' : 'text-neutral-400'}`}>Xác nhận thành công</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Direct QR scanner camera */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Camera Card */}
                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-neutral-800">Xác nhận Nhận hàng Trực tiếp</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">Vui lòng quét mã tại địa điểm nhà cung cấp</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase tracking-wider">
                      Bước {currentStep}/2
                    </span>
                  </div>

                  {/* Camera Screen view */}
                  <div className="bg-neutral-900 aspect-video relative flex items-center justify-center group overflow-hidden">
                    
                    {currentStep === 1 ? (
                      <>
                        {/* Mock live camera view (a bakery shelf image) */}
                        <div className="absolute inset-0 bg-cover bg-center filter blur-[1px] opacity-70" style={{ 
                          backgroundImage: "url('https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=800&auto=format&fit=crop')"
                        }} />

                        {/* Scanner square overlay */}
                        <div className="relative w-64 h-64 border-2 border-emerald-500 rounded-2xl z-10 flex items-center justify-center shadow-[0_0_80px_rgba(16,185,129,0.3)]">
                          {/* Pulsing scanning red line */}
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500 animate-bounce" />
                          
                          {/* Inner Mock QR code on a paper bag */}
                          <div className="w-24 h-24 bg-white p-2.5 rounded-lg border border-neutral-300 flex items-center justify-center opacity-90">
                            <QRCodeSVG value={reservation.qrToken!} size={80} level="M" />
                          </div>

                          {/* Scanner corners */}
                          <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-emerald-600 rounded-tl-md" />
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-emerald-600 rounded-tr-md" />
                          <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-emerald-600 rounded-bl-md" />
                          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-emerald-600 rounded-br-md" />
                        </div>

                        {/* Centered translucent instruction pill */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur px-5 py-2.5 rounded-full z-20 flex items-center gap-2 border border-white/10 text-white max-w-[90%]">
                          <span className="material-symbols-outlined text-[16px] text-emerald-400">info</span>
                          <span className="text-xs font-medium">Đưa mã QR của Nhà cung cấp vào khung</span>
                        </div>

                        {/* Floating Click to Scan Simulation Trigger overlay */}
                        <div className="absolute inset-0 bg-black/10 hover:bg-black/35 transition-all flex items-center justify-center cursor-pointer group" onClick={handleSimulateScan}>
                          <div className="bg-emerald-600/90 text-white px-5 py-3 rounded-full text-xs font-bold scale-0 group-hover:scale-100 transition-all shadow-md flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                            <span>Nhấn để quét mã (Mô phỏng)</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Success Completed Animation View */
                      <div className="absolute inset-0 bg-emerald-950/95 flex flex-col items-center justify-center text-center p-6 space-y-4 animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center animate-bounce shadow-lg">
                          <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        </div>
                        <div>
                          <h4 className="font-black text-xl text-white">NHẬN HÀNG THÀNH CÔNG</h4>
                          <p className="text-xs text-emerald-300 mt-1 max-w-[280px]">
                            Thực phẩm cứu trợ đã được bàn giao an toàn. Cảm ơn sự đồng hành của bạn!
                          </p>
                        </div>
                        <div className="bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-3 text-white text-xs max-w-sm">
                          <span className="material-symbols-outlined text-amber-400 text-[24px]">verified</span>
                          <div className="text-left">
                            <p className="font-bold text-amber-400">+2 Điểm Uy Tín</p>
                            <p className="text-[10px] text-neutral-300">Điểm uy tín của bạn đã được cập nhật thành công</p>
                          </div>
                        </div>
                        <Link href="/reservations" className="px-6 py-2.5 bg-white text-emerald-900 rounded-xl text-xs font-bold shadow-md hover:bg-neutral-100 transition-all">
                          Trở lại danh sách đơn
                        </Link>
                      </div>
                    )}

                  </div>

                  {/* Details row below camera */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-100 bg-neutral-50/50">
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">storefront</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Nhà cung cấp</p>
                        <p className="text-xs font-bold text-neutral-800">{reservation.listing.provider.businessName}</p>
                      </div>
                    </div>
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">location_on</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Địa chỉ lấy</p>
                        <p className="text-xs font-bold text-neutral-800 truncate max-w-[240px]">{reservation.listing.pickupAddress}</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Listing items bag, Target goal progress bar, Provider information */}
              <div className="space-y-6">
                
                {/* Food list bag details card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                    <h4 className="font-bold text-sm">Chi tiết túi thực phẩm {mockListing.orderId}</h4>
                  </div>
                  
                  {/* Detailed items list */}
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

                {/* Gamified progress bar card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-3">
                  <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">BẠN ĐANG LÀM RẤT TỐT!</p>
                  <h4 className="font-bold text-sm text-neutral-850">Tiến độ giải cứu thực phẩm</h4>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-3 w-full bg-emerald-50 rounded-full overflow-hidden border border-emerald-100">
                      <div className="h-full bg-emerald-700 rounded-full transition-all duration-1000" style={{ width: currentStep === 2 ? '78%' : '73%' }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-400 font-bold">
                      <span>36.5 kg đã cứu</span>
                      <span>Mục tiêu: 50 kg</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-500 font-medium">
                    🏆 Nhận đơn này để tích lũy thêm <span className="font-bold text-emerald-700">2.5kg</span> giúp đạt mốc giải cứu 50kg trong tháng!
                  </p>
                </div>

                {/* Provider store profile card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-neutral-400 uppercase tracking-wider text-[10px] font-bold">
                    <span className="material-symbols-outlined text-[16px]">storefront</span>
                    <span>Thông tin Nhà cung cấp</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="text-neutral-400 text-[10px]">Tên cửa hàng</p>
                      <p className="font-bold text-neutral-800">{reservation.listing.provider.businessName}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400 text-[10px]">Địa chỉ nhận hàng</p>
                      <p className="font-semibold text-neutral-700 leading-normal">{reservation.listing.provider.address}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400 text-[10px]">Giờ mở cửa</p>
                      <p className="font-bold text-emerald-700">08:00 - 21:00</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(reservation.listing.provider.address)}`, '_blank')}
                    className="w-full py-2.5 border border-emerald-700 hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[16px]">explore</span>
                    Chỉ đường
                  </button>
                </div>

              </div>

            </div>
          </div>
        )}

      </div>

      {/* Floating Emergency Help Action Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button 
          onClick={() => {
            toast.info('Đang kết nối đến trung tâm trợ giúp khẩn cấp FoodResQ...');
            window.location.href = 'tel:19001000';
          }}
          className="bg-emerald-900 hover:bg-emerald-950 text-white px-5 py-3 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 transition-all hover:scale-105 active:scale-95 border border-white/10"
        >
          <span className="material-symbols-outlined text-[18px]">contact_support</span>
          <span>Hỗ trợ khẩn cấp</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MOCK CHAT DRAWER OVERLAY SIMULATION                                        */}
      {/* ========================================================================= */}
      {isChatOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end animate-fade-in" onClick={() => setIsChatOpen(false)}>
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-slide-in-from-right" onClick={(e) => e.stopPropagation()}>
            
            {/* Chat Header */}
            <div className="p-4 border-b border-neutral-200 bg-emerald-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src={reservation.delivery?.shipper?.user?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop"} 
                  alt="Avatar" 
                  className="w-9 h-9 rounded-full object-cover border border-white/20" 
                />
                <div>
                  <h4 className="font-bold text-sm">{reservation.delivery?.shipper?.user?.fullName || 'Minh Tâm'}</h4>
                  <span className="text-[10px] text-emerald-200 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Đang hoạt động</span>
                  </span>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-neutral-50">
              {chatHistory.map((chat, idx) => {
                const isShipper = chat.sender === 'shipper';
                return (
                  <div key={idx} className={`flex ${isShipper ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-xs leading-normal shadow-sm ${
                      isShipper 
                        ? 'bg-white text-neutral-800 rounded-tl-none border border-neutral-200' 
                        : 'bg-emerald-800 text-white rounded-tr-none'
                    }`}>
                      {chat.text}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input Footer */}
            <div className="p-4 border-t border-neutral-200 bg-white flex items-center gap-2">
              <input 
                type="text" 
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Nhập tin nhắn..." 
                className="flex-1 border border-neutral-200 focus:border-emerald-600 focus:outline-none rounded-xl px-4 py-2 text-xs" 
              />
              <button 
                onClick={handleSendMessage}
                className="w-9 h-9 rounded-xl bg-emerald-800 hover:bg-emerald-950 text-white flex items-center justify-center transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
