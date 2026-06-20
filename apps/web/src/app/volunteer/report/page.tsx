"use client";

import Link from "next/link";
import { useState } from "react";

export default function ReportIncidentPage() {
  const [selectedIncident, setSelectedIncident] = useState<string>("Thực phẩm không đúng mô tả");

  const incidentTypes = [
    { id: "wrong_food", label: "Thực phẩm không đúng mô tả", icon: "restaurant" },
    { id: "provider_absent", label: "Nhà cung cấp không có mặt", icon: "block" },
    { id: "receiver_unreachable", label: "Người nhận không liên lạc được", icon: "perm_phone_msg" },
    { id: "traffic_issue", label: "Sự cố giao thông/phương tiện", icon: "traffic" },
    { id: "other", label: "Khác", icon: "more_horiz" },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Breadcrumb & Header */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium mb-6">
          <Link href="/volunteer/history" className="text-neutral-500 hover:text-emerald-700 transition-colors">
            Lịch sử giao hàng
          </Link>
          <span className="material-symbols-outlined text-[16px] text-neutral-400">chevron_right</span>
          <span className="text-emerald-800 font-bold">Gửi báo cáo</span>
        </div>
        
        <h2 className="text-3xl font-bold text-neutral-800 mb-2">Gửi báo cáo sự cố</h2>
        <p className="text-neutral-500 font-medium">Vui lòng cung cấp chi tiết về vấn đề bạn gặp phải trong quá trình giao hàng.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Form */}
        <div className="flex-[2] flex flex-col gap-8">
          {/* Delivery Context */}
          <div className="bg-white rounded-3xl p-6 border border-neutral-100 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <span className="px-3 py-1 bg-[#E8F5E9] text-emerald-800 rounded-full text-xs font-bold tracking-wide">
                Task ID #RQ-882
              </span>
              <span className="text-sm font-medium text-neutral-500">Hoàn thành: 2 giờ trước</span>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 flex items-center gap-4">
                <div className="w-12 h-12 bg-[#F6EFEA] text-[#8D6B5A] rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">storefront</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-0.5">Nhà cung cấp</p>
                  <p className="font-bold text-neutral-800">Tiệm Bánh An Nhiên</p>
                </div>
              </div>
              <div className="hidden md:block w-px bg-neutral-200"></div>
              <div className="flex-1 flex items-center gap-4">
                <div className="w-12 h-12 bg-[#E8F5E9] text-emerald-800 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">person</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-0.5">Người nhận</p>
                  <p className="font-bold text-neutral-800">Chị Minh Anh</p>
                </div>
              </div>
            </div>
          </div>

          {/* Incident Types */}
          <div>
            <h3 className="text-xl font-bold text-neutral-800 mb-4">Loại sự cố</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incidentTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedIncident(type.label)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                    selectedIncident === type.label 
                      ? "border-emerald-600 bg-[#FAFBF9] text-emerald-800" 
                      : "border-neutral-100 bg-white text-neutral-600 hover:border-neutral-200"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{type.icon}</span>
                  <span className="font-medium text-sm">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div>
            <h3 className="text-xl font-bold text-neutral-800 mb-4">Mô tả chi tiết</h3>
            <textarea 
              rows={5}
              placeholder="Hãy kể chi tiết điều gì đã xảy ra..."
              className="w-full p-4 rounded-2xl border-2 border-neutral-200/50 bg-white focus:border-emerald-500 focus:ring-0 outline-none resize-none font-medium placeholder:text-neutral-400 transition-colors"
            ></textarea>
          </div>

          {/* Upload Proof */}
          <div>
            <h3 className="text-xl font-bold text-neutral-800 mb-4">Minh chứng hình ảnh</h3>
            <div className="border-2 border-dashed border-emerald-300 bg-[#FAFBF9] rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#F2F9F2] transition-colors">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
              </div>
              <p className="font-bold text-neutral-800 mb-1">Kéo thả ảnh hoặc nhấn để tải lên</p>
              <p className="text-neutral-500 text-sm mb-4">Tối đa 4 ảnh, định dạng JPG hoặc PNG</p>
              <button className="font-bold text-emerald-700">Chọn tệp tin</button>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex gap-4">
            <span className="material-symbols-outlined text-rose-600">info</span>
            <div>
              <p className="font-bold text-rose-800 text-sm mb-1">Lưu ý quan trọng</p>
              <p className="text-rose-700 text-sm leading-relaxed">Việc cung cấp thông tin sai sự thật có thể làm giảm Trust Score và ảnh hưởng đến quyền lợi tham gia cứu trợ của bạn trong tương lai.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-4">
            <Link href="/volunteer/history" className="px-8 py-3 bg-white text-neutral-600 hover:text-neutral-900 font-bold rounded-full transition-colors">
              Hủy bỏ
            </Link>
            <button className="px-8 py-3 bg-[#A3E6A1] hover:bg-[#8CDA87] text-emerald-900 font-bold rounded-full transition-colors">
              Gửi báo cáo
            </button>
          </div>
        </div>

        {/* Right Sidebar Info */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-[#FDFBF7] rounded-3xl p-6 border border-[#EBE8E3] shadow-sm">
            <h4 className="font-bold text-neutral-800 mb-6">Số liệu giao hàng</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 font-medium text-sm">Tổng đơn đã giao</span>
                <span className="font-bold text-neutral-800">124</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 font-medium text-sm">Tỷ lệ thành công</span>
                <span className="font-bold text-neutral-800">98.5%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 font-medium text-sm">Trust Score</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">4.9 <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span></span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-200 rounded-3xl h-[240px] relative overflow-hidden flex items-end p-4 border border-neutral-100">
             <img 
               src="https://a.tile.openstreetmap.org/15/25732/15316.png" 
               className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-60" 
               alt="Map Background"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
             
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-8 h-8 rounded-full border-4 border-white bg-orange-400 shadow-md"></div>
             </div>

             <div className="relative z-10 text-white w-full">
               <p className="font-bold text-sm">Vị trí sự cố</p>
               <p className="text-xs opacity-90 truncate">Phường 5, Quận 3, TP.HCM</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
