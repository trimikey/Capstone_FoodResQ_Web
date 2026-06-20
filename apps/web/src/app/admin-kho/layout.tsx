"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminKhoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/admin-kho/overview", icon: "grid_view", label: "Tổng quan thống kê" },
    { href: "/admin-kho", icon: "inventory_2", label: "Quản lý Kho" },
    { href: "/admin-kho/map", icon: "map", label: "Bản đồ trực tiếp" },
    { href: "/admin-kho/donations", icon: "volunteer_activism", label: "Quản lý Quyên góp" },
    { href: "/admin-kho/volunteers", icon: "group", label: "Quản lý Tình nguyện viên" },
    { href: "/admin-kho/reports", icon: "warning", label: "Xử lý khiếu nại" },
    { href: "/admin-kho/accounts", icon: "manage_accounts", label: "Quản lý tài khoản" },
    { href: "/admin-kho/settings", icon: "settings", label: "Cài đặt hệ thống" },
  ];

  return (
    <div className="flex min-h-screen bg-[#F6F7F9] font-sans text-neutral-800">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-[260px] flex-col border-r border-neutral-200/50 bg-[#F9FAFB] h-screen sticky top-0 shrink-0">
        <div className="p-8 pb-6">
          <h1 className="font-bold text-2xl text-emerald-800 tracking-tight mb-1">FoodResQ</h1>
          <p className="text-xs text-neutral-500 font-medium">Hệ thống quản trị</p>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${
                  isActive
                    ? "bg-[#A3E6A1] text-emerald-900 shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4">
          <button className="w-full py-3 bg-[#1E5A2A] hover:bg-[#154520] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Tạo báo cáo mới
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header */}
        <header className="flex justify-between items-center px-8 py-4 sticky top-0 z-10 bg-[#F6F7F9] backdrop-blur-md">
          {/* Search */}
          <div className="relative w-full max-w-md">
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              className="w-full bg-[#EAECEF] border-none rounded-full py-2.5 pl-4 pr-10 text-sm font-medium text-neutral-800 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <span className="material-symbols-outlined absolute right-3 top-2.5 text-neutral-500 pointer-events-none">search</span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <button className="w-10 h-10 rounded-full hover:bg-neutral-200/50 flex items-center justify-center transition-colors relative">
                <span className="material-symbols-outlined text-neutral-600">notifications</span>
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full"></span>
              </button>
              <button className="w-10 h-10 rounded-full hover:bg-neutral-200/50 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-neutral-600">help_outline</span>
              </button>
            </div>
            
            <div className="flex items-center gap-3 border-l border-neutral-300 pl-6">
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold text-neutral-800">Admin Kho</p>
                <p className="text-xs text-neutral-500">Quản trị viên</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-100 overflow-hidden shadow-sm">
                <img src="https://i.pravatar.cc/150?img=33" alt="Avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 px-8 pb-12 w-full max-w-[1400px]">
          {children}
        </div>
      </main>

      {/* Bottom Nav - Mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#F9FAFB] border-t border-neutral-200/50 flex justify-around pb-safe overflow-x-auto">
        {navItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-3 gap-1 px-3 min-w-[70px] ${
                isActive ? "text-emerald-800" : "text-neutral-500"
              }`}
            >
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              <span className="text-[10px] font-medium whitespace-nowrap truncate w-full text-center">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
