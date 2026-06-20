"use client";

import { useState } from "react";

export default function VolunteerProfilePage() {
  const [isReady, setIsReady] = useState(true);
  const [vehicle, setVehicle] = useState("motorbike");

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold text-neutral-800 mb-2">Hồ sơ Tình nguyện viên</h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Profile Card */}
        <div className="w-full lg:w-[320px] flex flex-col gap-6">
          <div className="bg-[#FAF8F5] rounded-3xl p-8 flex flex-col items-center border border-[#EBE8E3] shadow-sm relative">
            <div className="relative mb-4">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-md">
                <img src="https://i.pravatar.cc/150?img=11" alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-1 right-1 w-6 h-6 bg-[#A3E6A1] border-4 border-[#FAF8F5] rounded-full"></div>
            </div>

            <h3 className="text-2xl font-bold text-neutral-800">Nguyễn Văn A</h3>
            <p className="text-neutral-500 text-sm mt-1 mb-6">Thành viên từ Tháng 10, 2023</p>

            <div className="flex items-center gap-2 bg-[#E8F5E9] text-emerald-800 px-4 py-2 rounded-full mb-6 text-sm font-bold w-full justify-center">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              4.9/5.0 Sao - Uy tín cao
            </div>

            <div className="bg-[#F5EBE4]/50 w-full p-4 rounded-2xl flex justify-between items-center">
              <span className="font-bold text-neutral-800 text-sm">Trạng thái: Sẵn sàng</span>
              <button 
                onClick={() => setIsReady(!isReady)}
                className={`w-12 h-6 rounded-full relative transition-colors ${isReady ? "bg-[#A3E6A1]" : "bg-neutral-300"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${isReady ? "left-6" : "left-0.5"}`}></div>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-neutral-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#E8F5E9] text-emerald-800 flex items-center justify-center">
              <span className="material-symbols-outlined">volunteer_activism</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-800">124</p>
              <p className="text-neutral-500 text-xs font-medium">Bữa ăn đã giải cứu</p>
            </div>
          </div>
        </div>

        {/* Right Forms */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-8 border border-neutral-100 shadow-sm">
            <h3 className="text-2xl font-bold text-neutral-800 mb-2">Thông tin cá nhân</h3>
            <p className="text-neutral-500 text-sm font-medium mb-8">Cập nhật thông tin để chúng tôi gợi ý nhiệm vụ phù hợp nhất cho bạn.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-bold text-neutral-800 mb-2">Số điện thoại</label>
                <input 
                  type="text" 
                  defaultValue="090 123 4567" 
                  className="w-full bg-[#F6EFEA]/30 border-none rounded-xl p-4 text-neutral-800 font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-800 mb-2">Email</label>
                <input 
                  type="email" 
                  defaultValue="nguyenvana@gmail.com" 
                  className="w-full bg-[#F6EFEA]/30 border-none rounded-xl p-4 text-neutral-800 font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-neutral-800 mb-2">Khu vực hoạt động ưu tiên</label>
              <div className="relative">
                <select className="w-full bg-[#F6EFEA]/30 border-none rounded-xl p-4 text-neutral-800 font-medium appearance-none focus:ring-2 focus:ring-emerald-500">
                  <option>Bình Thạnh</option>
                  <option>Quận 1</option>
                  <option>Quận 3</option>
                </select>
                <span className="material-symbols-outlined absolute right-4 top-4 text-neutral-500 pointer-events-none">expand_more</span>
              </div>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-bold text-neutral-800 mb-2">Loại phương tiện</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button 
                  onClick={() => setVehicle("motorbike")}
                  className={`p-4 rounded-2xl border-2 flex justify-between items-center transition-all ${
                    vehicle === "motorbike" ? "border-[#A3E6A1] bg-[#FAFBF9] text-emerald-900" : "border-neutral-100 bg-[#F6EFEA]/30 text-neutral-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined">two_wheeler</span>
                    <span className="font-bold text-sm">Xe máy</span>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${vehicle === "motorbike" ? "border-emerald-500" : "border-neutral-300"}`}>
                    {vehicle === "motorbike" && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>}
                  </div>
                </button>

                <button 
                  onClick={() => setVehicle("bicycle")}
                  className={`p-4 rounded-2xl border-2 flex justify-between items-center transition-all ${
                    vehicle === "bicycle" ? "border-[#A3E6A1] bg-[#FAFBF9] text-emerald-900" : "border-neutral-100 bg-[#F6EFEA]/30 text-neutral-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined">pedal_bike</span>
                    <span className="font-bold text-sm">Xe đạp</span>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${vehicle === "bicycle" ? "border-emerald-500" : "border-neutral-300"}`}>
                    {vehicle === "bicycle" && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>}
                  </div>
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button className="px-8 py-3 bg-[#A3E6A1] hover:bg-[#8CDA87] text-emerald-900 font-bold rounded-full transition-colors">
                Lưu thay đổi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button className="bg-[#FAFBF9] border border-neutral-100 rounded-3xl p-6 shadow-sm flex items-center gap-4 text-left hover:border-emerald-200 transition-colors">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-neutral-600">security</span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-neutral-800 text-sm">Bảo mật & Đăng nhập</p>
                <p className="text-neutral-500 text-xs mt-1">Đổi mật khẩu, xác thực 2 lớp</p>
              </div>
              <span className="material-symbols-outlined text-neutral-400">chevron_right</span>
            </button>

            <button className="bg-[#FAFBF9] border border-neutral-100 rounded-3xl p-6 shadow-sm flex items-center gap-4 text-left hover:border-emerald-200 transition-colors">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-neutral-600">notifications_active</span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-neutral-800 text-sm">Thông báo</p>
                <p className="text-neutral-500 text-xs mt-1">Quản lý các loại thông báo</p>
              </div>
              <span className="material-symbols-outlined text-neutral-400">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
