"use client";

import { useState } from "react";

export default function VolunteerDashboard() {
  const [tasks] = useState([
    {
      id: 1,
      priority: "Ưu tiên cao",
      distance: "2.4 km",
      pickup: {
        name: "Tiệm bánh Sunshine",
        address: "123 Lê Lợi, Quận 1",
      },
      dropoff: {
        name: "Mái ấm Hy Vọng",
        address: "45 Nguyễn Huệ, Quận 1",
      },
    },
    {
      id: 2,
      priority: "Tiêu chuẩn",
      distance: "4.1 km",
      pickup: {
        name: "Nông trại Xanh",
        address: "88 Phan Xích Long, Phú Nhuận",
      },
      dropoff: {
        name: "Bếp ăn 0 đồng",
        address: "12 Trần Hưng Đạo, Quận 5",
      },
    },
    {
      id: 3,
      priority: "Tiêu chuẩn",
      distance: "1.8 km",
      pickup: {
        name: "Cửa hàng tiện lợi",
        address: "12 Phạm Ngũ Lão, Quận 1",
      },
      dropoff: {
        name: "Trại trẻ mồ côi",
        address: "55 Điện Biên Phủ, Quận Bình Thạnh",
      },
    }
  ]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-100px)]">
      {/* Left List */}
      <div className="w-full lg:w-[450px] flex flex-col gap-6">
        <div>
          <h2 className="text-3xl font-bold text-neutral-800 mb-2">Các đơn cần vận chuyển</h2>
          <p className="text-neutral-500 font-medium">Chọn một nhiệm vụ để bắt đầu hành trình sẻ chia của bạn.</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-10">
          {tasks.map((task, index) => (
            <div 
              key={task.id} 
              className={`p-6 rounded-3xl border-2 transition-all ${
                index === 0 ? "border-emerald-300 bg-white shadow-sm" : "border-neutral-100 bg-white"
              }`}
            >
              <div className="flex justify-between items-center mb-6">
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  task.priority === "Ưu tiên cao" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
                }`}>
                  {task.priority}
                </span>
                <span className="flex items-center gap-1 text-neutral-500 font-medium text-sm">
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                  {task.distance}
                </span>
              </div>

              <div className="relative pl-6 space-y-6">
                {/* Timeline line */}
                <div className="absolute left-2.5 top-2 bottom-4 w-0.5 bg-neutral-200"></div>

                <div className="relative">
                  <div className="absolute -left-[27px] top-1 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  </div>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Điểm lấy hàng</p>
                  <p className="font-bold text-neutral-800 text-lg">{task.pickup.name}</p>
                  <p className="text-neutral-500 text-sm mt-1">{task.pickup.address}</p>
                </div>

                <div className="relative">
                  <div className="absolute -left-[27px] top-1 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  </div>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Điểm giao hàng</p>
                  <p className="font-bold text-neutral-800 text-lg">{task.dropoff.name}</p>
                  <p className="text-neutral-500 text-sm mt-1">{task.dropoff.address}</p>
                </div>
              </div>

              <button className="w-full mt-6 py-3 bg-[#9DE898] hover:bg-[#8CDA87] text-neutral-900 font-bold rounded-full transition-colors">
                Chấp nhận đơn
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Map */}
      <div className="hidden lg:flex flex-1 bg-[#FDF6ED] rounded-[40px] overflow-hidden relative border border-orange-100 items-center justify-center">
        {/* Mock Map Image */}
        <div className="absolute inset-0 opacity-50 bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')]"></div>
        <img 
          src="https://a.tile.openstreetmap.org/15/25732/15316.png" 
          className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-50 blur-[2px] scale-110" 
          alt="Map Background"
        />
        
        {/* Mock Map UI Wrapper */}
        <div className="w-[320px] h-[600px] bg-white rounded-[40px] shadow-2xl relative z-10 border-8 border-white overflow-hidden flex flex-col">
          <div className="absolute inset-0 bg-[#E8F3E9] opacity-50"></div>
          
          {/* Map Overlay Controls */}
          <div className="absolute top-4 left-4 right-4 z-20">
            <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E8F3E9] rounded-xl flex items-center justify-center text-emerald-800">
                <span className="material-symbols-outlined">map</span>
              </div>
              <div>
                <p className="font-bold text-sm text-neutral-800">Chế độ xem bản đồ</p>
                <p className="text-xs text-neutral-500">Lộ trình tối ưu đang hiển thị</p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 right-4 flex flex-col gap-2 z-20">
            <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-neutral-600 hover:text-emerald-700">
              <span className="material-symbols-outlined">add</span>
            </button>
            <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-neutral-600 hover:text-emerald-700">
              <span className="material-symbols-outlined">remove</span>
            </button>
          </div>
          
          {/* Mock Pins */}
          <div className="absolute top-1/3 left-1/3 z-10">
            <div className="bg-white px-3 py-1.5 rounded-full shadow-sm text-xs font-bold text-neutral-800 mb-1 absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              Tiệm bánh Sunshine
            </div>
            <span className="material-symbols-outlined text-4xl text-orange-500 drop-shadow-md relative -left-4 -top-4">location_on</span>
          </div>

          <div className="absolute bottom-1/3 right-1/4 z-10">
            <div className="bg-white px-3 py-1.5 rounded-full shadow-sm text-xs font-bold text-neutral-800 mb-1 absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              Mái ấm Hy Vọng
            </div>
            <span className="material-symbols-outlined text-4xl text-emerald-600 drop-shadow-md relative -left-4 -top-4">location_on</span>
          </div>

          {/* SVG Dotted Line connecting pins */}
          <svg className="absolute inset-0 z-0 w-full h-full pointer-events-none">
             <path d="M 110 210 Q 150 350 220 390" fill="none" stroke="#666" strokeWidth="2" strokeDasharray="6,6" opacity="0.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
