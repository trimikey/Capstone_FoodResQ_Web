"use client";

import { useState } from "react";
import Link from "next/link";

export default function DeliveryHistoryPage() {
  const [historyItems] = useState([
    {
      id: "FRQ-2024-038",
      date: "20/05",
      year: "2024",
      pickup: "Tiệm bánh Sunshine",
      dropoff: "Mái ấm Hy Vọng",
      weight: "25 kg",
      portions: "50 phần ăn",
      status: "completed",
      hasWarning: false,
    },
    {
      id: "FRQ-2024-037",
      date: "18/05",
      year: "2024",
      pickup: "Nhà hàng Sen Vàng",
      dropoff: "Bếp ăn Từ thiện Quận 3",
      weight: "12 kg",
      portions: "30 phần ăn",
      status: "completed",
      hasWarning: false,
    },
    {
      id: "FRQ-2024-036",
      date: "15/05",
      year: "2024",
      pickup: "Green Coffee Co.",
      dropoff: "Trung tâm Bảo trợ Trẻ em",
      weight: "8 kg",
      portions: "20 phần nước",
      status: "completed",
      hasWarning: false,
    },
    {
      id: "FRQ-2024-035",
      date: "12/05",
      year: "2024",
      pickup: "Siêu thị Fresh Market",
      dropoff: "Viện dưỡng lão Bình An",
      weight: "45 kg",
      portions: "Rau củ tươi",
      status: "completed",
      hasWarning: true,
      warningText: "Bạn có 1 khiếu nại mới về chuyến giao #FRQ-2024-035. Admin đang xem xét, vui lòng chú ý.",
    }
  ]);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-neutral-800 mb-2">Lịch sử giao hàng</h2>
          <p className="text-neutral-500 font-medium">Xem lại hành trình ý nghĩa và những đóng góp của bạn cho cộng đồng.</p>
        </div>
        <div className="flex gap-4">
          <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-neutral-600">help_outline</span>
          </button>
          <div className="relative">
            <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-neutral-600">notifications</span>
            </button>
            <span className="absolute top-0 right-0 w-3 h-3 bg-rose-500 rounded-full border-2 border-[#FAFBF9]"></span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#A3E6A1] text-emerald-900 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-2xl">volunteer_activism</span>
          </div>
          <p className="text-neutral-500 font-medium mb-1">Tổng số chuyến</p>
          <p className="text-4xl font-bold text-[#8D6B5A]">142 chuyến</p>
        </div>

        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#B2DFDB] text-teal-900 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-2xl">route</span>
          </div>
          <p className="text-neutral-500 font-medium mb-1">Quãng đường đã đi</p>
          <p className="text-4xl font-bold text-[#8D6B5A]">560 km</p>
        </div>

        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#FFCCBC] text-orange-900 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-2xl">bakery_dining</span>
          </div>
          <p className="text-neutral-500 font-medium mb-1">Bữa ăn đã vận chuyển</p>
          <p className="text-4xl font-bold text-[#8D6B5A]">3,500 bữa</p>
        </div>
      </div>

      {/* List Header */}
      <div className="flex justify-between items-center mt-4">
        <h3 className="text-2xl font-bold text-neutral-800">Danh sách vận chuyển</h3>
        <button className="flex items-center gap-2 text-neutral-600 font-medium hover:text-neutral-900 transition-colors">
          <span className="material-symbols-outlined">filter_list</span>
          Lọc kết quả
        </button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-4 pb-12">
        {historyItems.map((item, index) => (
          <div key={index} className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 flex flex-col md:flex-row items-center gap-6 relative">
            {/* Date */}
            <div className="flex flex-col items-center justify-center md:w-24 shrink-0 border-r border-neutral-100 pr-4">
              <span className="text-neutral-500 font-medium text-sm">{item.date}</span>
              <span className="text-neutral-800 font-bold text-lg">{item.year}</span>
            </div>

            {/* Locations */}
            <div className="flex-1 flex flex-col gap-2 w-full">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-neutral-400 text-[20px]">storefront</span>
                <span className="font-bold text-neutral-800">{item.pickup}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">location_on</span>
                <span className="font-medium text-neutral-600">{item.dropoff}</span>
              </div>
            </div>

            {/* Details */}
            <div className="flex-1 flex flex-col items-start md:items-end w-full">
               <span className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Khối lượng</span>
               <span className="font-medium text-neutral-800">{item.weight} • {item.portions}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-[#A3E6A1]/40 text-emerald-800 rounded-full font-bold text-sm whitespace-nowrap">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Hoàn thành
              </div>
              <Link 
                href="/volunteer/report"
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-rose-500 text-rose-500 hover:bg-rose-50 rounded-full font-bold text-sm whitespace-nowrap transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">error</span>
                Báo cáo
              </Link>
            </div>

            {/* Warning Tooltip */}
            {item.hasWarning && (
              <div className="absolute top-[105%] left-0 md:left-auto md:right-0 bg-[#2C2C2C] text-white p-4 rounded-xl shadow-xl z-20 w-[90%] md:w-[400px] flex gap-3 border border-[#3C3C3C]">
                <span className="material-symbols-outlined text-rose-400">warning</span>
                <div className="flex-1">
                  <p className="text-sm font-medium leading-relaxed">{item.warningText}</p>
                  <button className="text-emerald-400 text-sm font-bold mt-2 hover:underline">Xem chi tiết</button>
                </div>
                <button className="text-neutral-400 hover:text-white">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-center mt-4">
          <button className="px-8 py-3 bg-[#A3E6A1] hover:bg-[#8CDA87] text-emerald-900 font-bold rounded-full transition-colors">
            Xem thêm lịch sử
          </button>
        </div>
      </div>
    </div>
  );
}
