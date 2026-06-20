"use client";

export default function ActiveDeliveryPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-100px)]">
      {/* Left Map View */}
      <div className="hidden lg:flex flex-[1.5] bg-[#E8EFE8] rounded-[40px] items-center justify-center p-4">
        {/* Mock Map UI Wrapper */}
        <div className="w-[360px] h-full max-h-[700px] bg-white rounded-[40px] shadow-2xl relative z-10 border-8 border-white overflow-hidden flex flex-col">
          <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')]"></div>
          <img 
            src="https://a.tile.openstreetmap.org/15/25732/15316.png" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-50 blur-[1px] scale-125" 
            alt="Map Background"
          />

          {/* Top Search Bar Mock */}
          <div className="absolute top-6 left-6 right-6 z-20 bg-white/90 backdrop-blur-md rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[18px]">storefront</span>
            </div>
            <span className="font-semibold text-sm text-neutral-800 flex-1">Tiệm Bánh Mặt Trời</span>
            <span className="material-symbols-outlined text-neutral-400">search</span>
          </div>

          {/* Route path mock */}
          <svg className="absolute inset-0 z-0 w-full h-full pointer-events-none">
            <path d="M 120 200 L 150 300 L 250 450" fill="none" stroke="#2E7D32" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
          </svg>

          {/* Map Pins */}
          <div className="absolute top-[180px] left-[100px] z-10">
            <span className="material-symbols-outlined text-[32px] text-orange-500 drop-shadow-md">location_on</span>
          </div>
          
          <div className="absolute top-[430px] left-[230px] z-10">
            <div className="w-6 h-6 rounded-full border-4 border-white bg-rose-400 shadow-md"></div>
          </div>

          {/* Bottom Card Mock */}
          <div className="absolute bottom-6 left-6 right-6 z-20">
            <div className="bg-white rounded-3xl p-4 shadow-lg flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-neutral-600 flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-[20px]">volunteer_activism</span>
              </div>
              <span className="font-bold text-neutral-800">Mái ấm Hy Vọng</span>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-28 right-6 flex flex-col gap-2 z-20">
            <button className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-neutral-600">
              <span className="material-symbols-outlined">add</span>
            </button>
            <button className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-neutral-600">
              <span className="material-symbols-outlined">remove</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Details */}
      <div className="flex-1 flex flex-col gap-8 bg-white rounded-[40px] p-8 shadow-sm border border-neutral-100 overflow-y-auto">
        <h2 className="text-xl font-bold text-neutral-800">Chi tiết đơn hàng đang giao</h2>

        {/* Progress Steps */}
        <div className="flex justify-between items-center px-4 relative mt-4">
          <div className="absolute left-10 right-10 top-5 h-0.5 bg-neutral-200 -z-10"></div>
          <div className="absolute left-10 right-[50%] top-5 h-0.5 bg-emerald-500 -z-10"></div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">check</span>
            </div>
            <span className="text-sm font-bold text-emerald-800">Lấy hàng</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">local_shipping</span>
            </div>
            <span className="text-sm font-bold text-emerald-800">Đang giao</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            </div>
            <span className="text-sm font-medium text-neutral-500">Hoàn tất</span>
          </div>
        </div>

        {/* Pickup & Dropoff details */}
        <div className="flex flex-col gap-6 mt-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-emerald-600 text-[20px]">location_on</span>
              <span className="font-medium text-neutral-600">Nơi lấy hàng</span>
            </div>
            <div className="bg-[#FAFBF9] rounded-2xl p-5">
              <p className="font-bold text-neutral-800 text-lg">Tiệm Bánh Mặt Trời</p>
              <p className="text-neutral-500 text-sm mt-1 mb-4">123 Đường Hoa Hồng, Quận 1, TP. HCM</p>
              <div className="bg-[#E8F5E9] text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                Đã gửi thông báo: Shipper đang đến lấy
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-neutral-400 text-[20px]">location_on</span>
              <span className="font-medium text-neutral-600">Nơi giao đến</span>
            </div>
            <div className="bg-[#FAFBF9] rounded-2xl p-5">
              <p className="font-bold text-neutral-800 text-lg">Mái ấm Hy Vọng</p>
              <p className="text-neutral-500 text-sm mt-1 mb-4">456 Đường Hạnh Phúc, Quận 3, TP. HCM</p>
              <div className="bg-[#E8F5E9] text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                Đã gửi thông báo: Shipper đang giao đến
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 mt-auto pt-6">
          <button className="w-full py-4 bg-[#A3E6A1] hover:bg-[#8CDA87] text-emerald-900 font-bold rounded-2xl transition-colors flex justify-center items-center gap-2 text-lg">
            <span className="material-symbols-outlined">check_circle</span>
            Cập nhật trạng thái: Đã lấy hàng
          </button>
          
          <button className="w-full py-4 bg-[#F5F5F5] text-neutral-400 font-bold rounded-2xl flex justify-center items-center gap-2 text-lg" disabled>
            <span className="material-symbols-outlined">verified</span>
            Xác nhận hoàn thành
          </button>
        </div>

        {/* Support Footer */}
        <div className="flex items-center justify-between bg-[#FAFBF9] p-4 rounded-2xl border border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600">
              <span className="material-symbols-outlined">support_agent</span>
            </div>
            <div>
              <p className="font-bold text-neutral-800 text-sm">Hỗ trợ nhanh</p>
              <p className="text-neutral-500 text-xs">Tổng đài 24/7</p>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-200">
            <span className="material-symbols-outlined">call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
