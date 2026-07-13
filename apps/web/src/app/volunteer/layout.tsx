"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

export default function VolunteerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const navItems = [
    { href: "/volunteer", icon: "assignment", label: "Nhiệm vụ vận chuyển" },
    { href: "/volunteer/active", icon: "local_shipping", label: "Đơn đang giao" },
    { href: "/volunteer/history", icon: "history", label: "Lịch sử giao hàng" },
    { href: "/volunteer/profile", icon: "person", label: "Hồ sơ" },
  ];

  return (
    <div className="flex min-h-screen bg-[#FAFBF9] font-sans text-neutral-800">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-[280px] flex-col border-r border-neutral-200/50 bg-[#F6F5F2] h-screen sticky top-0">
        <div className="p-8 pb-4">
          <h1 className="font-bold text-3xl text-neutral-800 tracking-tight">FoodResQ</h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/volunteer");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-semibold ${
                  isActive
                    ? "bg-[#9DE898] text-neutral-900 shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900"
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200/50">
          <div className="flex items-center gap-3 p-3 bg-white/50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold text-emerald-800">{user?.fullName?.charAt(0) || "V"}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate text-neutral-800">{user?.fullName || "Volunteer Name"}</p>
              <p className="text-xs text-neutral-500 truncate">Thành viên vàng</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto bg-[#FAFBF9]">
        {/* Top Header - Mobile & Desktop actions */}
        <header className="flex justify-end items-center px-8 py-6 gap-4 sticky top-0 z-10 bg-[#FAFBF9]/80 backdrop-blur-md">
          <button className="w-10 h-10 rounded-full hover:bg-neutral-200/50 flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined text-neutral-600">notifications</span>
          </button>
          <button className="w-10 h-10 rounded-full hover:bg-neutral-200/50 flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined text-neutral-600">help</span>
          </button>
          {/* Mobile Avatar */}
          <div className="md:hidden w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
             <span className="font-bold text-emerald-800">{user?.fullName?.charAt(0) || "V"}</span>
          </div>
        </header>

        <div className="flex-1 px-4 md:px-8 pb-12 max-w-[1200px] w-full mx-auto">
          {children}
        </div>
      </main>

      {/* Bottom Nav - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#F6F5F2] border-t border-neutral-200/50 flex justify-around pb-safe">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/volunteer");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-3 gap-1 px-2 ${
                isActive ? "text-emerald-700" : "text-neutral-500"
              }`}
            >
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
