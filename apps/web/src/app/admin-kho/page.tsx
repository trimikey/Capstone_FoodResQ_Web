"use client";

import React from "react";

export default function AdminKhoPage() {
  return (
    <div className="flex flex-col xl:flex-row gap-8 items-start">
      {/* Left Main Section */}
      <div className="flex-[2.5] flex flex-col gap-8 w-full">
        {/* Header Title */}
        <div>
          <h2 className="text-3xl font-bold text-neutral-800 mb-2">Hệ thống Quản lý Kho</h2>
          <p className="text-neutral-500 font-medium text-sm">Theo dõi và tối ưu hóa nguồn lực thực phẩm cộng đồng.</p>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 z-10">
              <div className="w-12 h-12 bg-[#A3E6A1] rounded-2xl flex items-center justify-center text-emerald-900">
                <span className="material-symbols-outlined text-[24px]">payments</span>
              </div>
              <span className="px-3 py-1 bg-[#E8F5E9] text-emerald-800 rounded-full text-xs font-bold">+12%</span>
            </div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1 z-10">Tổng giá trị tồn kho</p>
            <p className="text-3xl font-extrabold text-neutral-800 z-10">45.280.000đ</p>
            <span className="material-symbols-outlined text-[100px] text-neutral-50 absolute -bottom-4 -right-4 z-0">inventory_2</span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 z-10">
              <div className="w-12 h-12 bg-[#FFF3E0] rounded-2xl flex items-center justify-center text-orange-600">
                <span className="material-symbols-outlined text-[24px]">warning</span>
              </div>
              <span className="px-3 py-1 bg-[#FDE8E8] text-rose-700 rounded-full text-xs font-bold">Cần chú ý</span>
            </div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1 z-10">Số mặt hàng sắp hết</p>
            <p className="text-3xl font-extrabold text-neutral-800 z-10">08 mặt hàng</p>
            <span className="material-symbols-outlined text-[100px] text-neutral-50 absolute -bottom-4 -right-4 z-0">low_priority</span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 z-10">
              <div className="w-12 h-12 bg-[#E8F5E9] rounded-2xl flex items-center justify-center text-emerald-700">
                <span className="material-symbols-outlined text-[24px]">local_shipping</span>
              </div>
              <span className="px-3 py-1 bg-[#F5F5F5] text-neutral-600 rounded-full text-xs font-bold">Đang giao</span>
            </div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1 z-10">Đơn nhập hàng đang xử lý</p>
            <p className="text-3xl font-extrabold text-neutral-800 z-10">03 đơn hàng</p>
            <span className="material-symbols-outlined text-[100px] text-neutral-50 absolute -bottom-4 -right-4 z-0">schedule</span>
          </div>
        </div>

        {/* Inventory List */}
        <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="p-6 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-neutral-100">
            <h3 className="text-xl font-bold text-neutral-800">Danh mục tồn kho</h3>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-full text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors">
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                Bộ lọc
              </button>
              <button className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-full text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors">
                <span className="material-symbols-outlined text-[18px]">download</span>
                Xuất file
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAFBF9] border-b border-neutral-100">
                  <th className="p-4 pl-6 text-xs font-bold text-neutral-500 uppercase tracking-wider w-[35%]">Tên nguyên liệu</th>
                  <th className="p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Danh mục</th>
                  <th className="p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center">Số lượng</th>
                  <th className="p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center">Đơn vị</th>
                  <th className="p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center">Trạng thái</th>
                  <th className="p-4 pr-6 text-xs font-bold text-neutral-500 uppercase tracking-wider text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {/* Item 1 */}
                <tr className="hover:bg-neutral-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                         <span className="text-xl">🥬</span>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-800 text-sm">Cải bó xôi Organic</p>
                        <p className="text-xs text-neutral-400 font-medium">Mã: VG-001</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-block px-3 py-1 bg-[#E8F5E9] text-emerald-800 text-xs font-bold rounded-full">Thực phẩm tươi</span>
                  </td>
                  <td className="p-4 text-center font-bold text-neutral-800">45.5</td>
                  <td className="p-4 text-center text-sm font-medium text-neutral-600">kg</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-sm font-semibold text-emerald-700">Còn hàng</span>
                    </div>
                  </td>
                  <td className="p-4 pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <button className="w-8 h-8 rounded-lg text-emerald-700 hover:bg-emerald-50 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[20px]">add_box</span>
                      </button>
                      <button className="w-8 h-8 rounded-lg text-neutral-500 hover:bg-neutral-100 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Item 2 */}
                <tr className="hover:bg-neutral-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                         <span className="text-xl">🍚</span>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-800 text-sm">Gạo ST25 cao cấp</p>
                        <p className="text-xs text-neutral-400 font-medium">Mã: DR-024</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-block px-3 py-1 bg-[#F5EBE4] text-[#8D6B5A] text-xs font-bold rounded-full">Đồ khô</span>
                  </td>
                  <td className="p-4 text-center font-bold text-neutral-800">12.0</td>
                  <td className="p-4 text-center text-sm font-medium text-neutral-600">bao (20kg)</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      <span className="text-sm font-semibold text-orange-600">Sắp hết</span>
                    </div>
                  </td>
                  <td className="p-4 pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <button className="w-8 h-8 rounded-lg text-emerald-700 hover:bg-emerald-50 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[20px]">add_box</span>
                      </button>
                      <button className="w-8 h-8 rounded-lg text-neutral-500 hover:bg-neutral-100 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Item 3 */}
                <tr className="hover:bg-neutral-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                         <span className="text-xl">🧂</span>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-800 text-sm">Gia vị hỗn hợp</p>
                        <p className="text-xs text-neutral-400 font-medium">Mã: SP-102</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-block px-3 py-1 bg-[#E8F5E9] text-emerald-800 text-xs font-bold rounded-full">Gia vị</span>
                  </td>
                  <td className="p-4 text-center font-bold text-neutral-800">0</td>
                  <td className="p-4 text-center text-sm font-medium text-neutral-600">hộp</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                      <span className="text-sm font-semibold text-rose-600">Hết hàng</span>
                    </div>
                  </td>
                  <td className="p-4 pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <button className="w-8 h-8 rounded-lg text-emerald-700 hover:bg-emerald-50 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[20px]">add_box</span>
                      </button>
                      <button className="w-8 h-8 rounded-lg text-neutral-500 hover:bg-neutral-100 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-neutral-100 flex items-center justify-center gap-2 bg-[#FAFBF9]">
            <button className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-800 transition-colors">
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button className="w-8 h-8 rounded-full bg-[#1E5A2A] text-white font-bold text-sm flex items-center justify-center">1</button>
            <button className="w-8 h-8 rounded-full hover:bg-neutral-200/50 text-neutral-600 font-bold text-sm flex items-center justify-center transition-colors">2</button>
            <button className="w-8 h-8 rounded-full hover:bg-neutral-200/50 text-neutral-600 font-bold text-sm flex items-center justify-center transition-colors">3</button>
            <button className="w-8 h-8 flex items-center justify-center text-neutral-600 hover:text-neutral-800 transition-colors">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar: History Timeline */}
      <div className="w-full xl:w-[320px] bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 flex flex-col shrink-0 relative">
        <div className="flex items-center gap-2 mb-8">
          <span className="material-symbols-outlined text-emerald-700">history</span>
          <h3 className="text-xl font-bold text-neutral-800">Lịch sử nhập kho</h3>
        </div>

        <div className="flex-1 relative">
          <div className="absolute left-[19px] top-4 bottom-10 w-0.5 bg-neutral-100"></div>

          <div className="space-y-6">
            {/* Timeline Item 1 */}
            <div className="relative flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#1E5A2A] text-white flex items-center justify-center shrink-0 z-10 border-4 border-white">
                <span className="material-symbols-outlined text-[18px]">download</span>
              </div>
              <div className="pt-2">
                <p className="font-bold text-neutral-800 text-sm mb-1">Nhập kho định kỳ</p>
                <p className="text-xs text-neutral-500 mb-2 leading-relaxed">120kg Rau củ quả từ Vườn Xanh</p>
                <p className="text-[10px] font-medium text-neutral-400">2 giờ trước • Bởi Lê Minh</p>
              </div>
            </div>

            {/* Timeline Item 2 */}
            <div className="relative flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#4CAF50] text-white flex items-center justify-center shrink-0 z-10 border-4 border-white">
                <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
              </div>
              <div className="pt-2">
                <p className="font-bold text-neutral-800 text-sm mb-1">Quyên góp nhận được</p>
                <p className="text-xs text-neutral-500 mb-2 leading-relaxed">50 suất cơm hộp tươi sống</p>
                <p className="text-[10px] font-medium text-neutral-400">5 giờ trước • Bởi Hoàng Anh</p>
              </div>
            </div>

            {/* Timeline Item 3 */}
            <div className="relative flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#757575] text-white flex items-center justify-center shrink-0 z-10 border-4 border-white">
                <span className="material-symbols-outlined text-[18px]">assignment</span>
              </div>
              <div className="pt-2">
                <p className="font-bold text-neutral-800 text-sm mb-1">Điều chỉnh tồn kho</p>
                <p className="text-xs text-neutral-500 mb-2 leading-relaxed">Kiểm kê cuối ngày - Hụt 2kg muối</p>
                <p className="text-[10px] font-medium text-neutral-400">Hôm qua • Bởi Trần Tú</p>
              </div>
            </div>

            {/* Timeline Item 4 */}
            <div className="relative flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#1E5A2A] text-white flex items-center justify-center shrink-0 z-10 border-4 border-white">
                <span className="material-symbols-outlined text-[18px]">download</span>
              </div>
              <div className="pt-2">
                <p className="font-bold text-neutral-800 text-sm mb-1">Nhập kho bổ sung</p>
                <p className="text-xs text-neutral-500 mb-2 leading-relaxed">20 lít dầu ăn Simply</p>
                <p className="text-[10px] font-medium text-neutral-400">Hôm qua • Bởi Lê Minh</p>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Add Button in Timeline */}
        <button className="absolute right-6 top-[280px] w-12 h-12 bg-[#1E5A2A] hover:bg-[#154520] text-white rounded-full flex items-center justify-center shadow-lg transition-colors z-20">
          <span className="material-symbols-outlined">add</span>
        </button>

        {/* Achievement Card */}
        <div className="mt-8 bg-[#FAFBF9] rounded-2xl p-5 border border-[#EBE8E3]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">eco</span>
            <p className="font-bold text-neutral-800 text-sm">Thành tích cứu trợ</p>
          </div>
          <div className="w-full bg-neutral-200 h-1.5 rounded-full mb-3 overflow-hidden">
            <div className="bg-[#1E5A2A] h-full rounded-full" style={{ width: "75%" }}></div>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed font-medium">Bạn đã cứu 750kg thực phẩm trong tháng này! (75% mục tiêu)</p>
        </div>

        <button className="w-full mt-4 py-3 text-emerald-800 font-bold text-sm hover:underline text-center">
          Xem tất cả hoạt động
        </button>
      </div>
    </div>
  );
}
