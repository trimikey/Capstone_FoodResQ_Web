'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  useAdminOverview,
  useVerifications,
  useReviewVerification,
  useAdminReports,
  useResolveReport,
  useAdminUsers,
  useSetUserStatus,
  useRecentReservations,
  useAdminConfigs,
  useSetConfig,
  useAdminCampaigns,
  useSetCampaignStatus,
  useAdminCampaignDetail,
  useAdminCampaignChangeRequests,
  useReviewCampaignChange,
  useAdminPendingAssignments,
  useReviewAssignment,
  useAdminFoodListings,
  useUpdateListingCategory,
  useAdminCharities,
  useAdminVolunteers,
  useCreateAdminCampaign,
  useUpdateAdminCampaign,
  useAssignVolunteer,
  useUnassignVolunteer,
  useVolunteersManage,
  useCreateUser,
  type SystemConfigItem,
  type AdminCampaign,
  type AdminCampaignDetail,
  type AdminCampaignChangeRequest,
  type PendingAssignment,
  type AdminFoodListing,
  type VolunteerDetail,
  type AdminUser,
  type CreateUserInput,
} from '@/hooks/useAdmin';
import { useListings } from '@/hooks/useListings';
import { FoodCategory, FoodGroup, FOOD_CATEGORY_LABEL, FOOD_GROUP_LABEL, FOOD_GROUP_CATEGORIES } from '@foodresq/types';
import { useAuthStore } from '@/stores/auth.store';
import NotificationBell from '@/components/shared/NotificationBell';

const HCM_CENTER = { lng: 106.6297, lat: 10.8231 };
const AdminMap = dynamic(() => import('@/components/map/ListingsMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse rounded-3xl" />,
});

const CATEGORY_LABEL: Record<string, string> = {
  cooked_meal: 'Đồ chín',
  bakery: 'Bánh ngọt',
  fresh_fruit: 'Trái cây',
  beverage: 'Đồ uống',
  vegetables: 'Rau củ',
  raw_protein: 'Thịt/cá sống',
  dry_goods: 'Đồ khô',
  canned_packaged: 'Đồ hộp',
  other: 'Khác',
};
const CATEGORY_COLOR: Record<string, string> = {
  cooked_meal: '#166534',
  bakery: '#22c55e',
  fresh_fruit: '#f59e0b',
  beverage: '#0ea5e9',
  vegetables: '#86efac',
  raw_protein: '#ef4444',
  dry_goods: '#d97706',
  canned_packaged: '#8b5cf6',
  other: '#a8a29e',
};
const MONTH_TARGET_KG = 2000; // mục tiêu cộng đồng theo tháng (hằng số cấu hình)
const fmtKg = (n: number) => `${n.toLocaleString('vi-VN')} kg`;

type Tab = 'dashboard' | 'map' | 'donations' | 'campaigns' | 'food' | 'volunteers' | 'reports' | 'monitor' | 'users' | 'settings';

const VOL_ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

const MAIN_TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Tổng quan thống kê', icon: 'dashboard' },
  { key: 'map', label: 'Bản đồ trực tiếp', icon: 'map' },
  { key: 'donations', label: 'Quản lý Quyên góp', icon: 'volunteer_activism' },
  { key: 'campaigns', label: 'Quản lý Chiến dịch', icon: 'soup_kitchen' },
  { key: 'food', label: 'Quản lý thức ăn', icon: 'restaurant_menu' },
  { key: 'volunteers', label: 'Quản lý Tình nguyện viên', icon: 'group' },
  { key: 'reports', label: 'Xử lý khiếu nại', icon: 'warning' },
  { key: 'monitor', label: 'Giám sát hệ thống', icon: 'monitoring' },
  { key: 'users', label: 'Quản lý tài khoản', icon: 'manage_accounts' },
];

const ROLE_LABEL_ADMIN: Record<string, string> = {
  admin: 'Quản trị viên',
  provider: 'Nhà cung cấp',
  receiver: 'Người nhận',
  volunteer: 'Tình nguyện viên',
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [accountMenu, setAccountMenu] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const { user, logout } = useAuthStore();
  const router = useRouter();

  function handleLogout() {
    logout();
    toast.success('Đã đăng xuất');
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] md:flex text-neutral-900">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-[280px] bg-[#f9faf9] border-r border-neutral-200 h-screen sticky top-0 shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-700 flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-white text-[24px]">eco</span>
          </div>
          <div>
            <h1 className="font-extrabold text-2xl text-emerald-800 leading-tight tracking-tight">FoodResQ</h1>
            <p className="text-xs text-neutral-600 font-medium mt-0.5">Admin Dashboard</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {MAIN_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-[14px] font-bold transition-all ${
                tab === t.key 
                  ? 'bg-emerald-300/40 text-emerald-900 shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: tab === t.key ? "'FILL' 1" : "'FILL' 0" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-neutral-200/60 space-y-1">
          <button
            onClick={() => setTab('settings')}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-[14px] font-bold transition-all ${
              tab === 'settings' ? 'bg-emerald-300/40 text-emerald-900 shadow-sm' : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: tab === 'settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
            Cài đặt hệ thống
          </button>
          {/* Khối tài khoản — bấm để mở menu */}
          <div className="relative mt-2">
            <button
              onClick={() => setAccountMenu((v) => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-neutral-200/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-lg overflow-hidden border-2 border-white shadow-sm shrink-0">
                {user?.fullName?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-neutral-900 truncate">{user?.fullName || 'Admin FoodResQ'}</p>
                <p className="text-xs text-neutral-500 truncate">{user ? ROLE_LABEL_ADMIN[user.role] ?? user.role : 'Quản trị viên'}</p>
              </div>
              <span className={`material-symbols-outlined text-[20px] text-neutral-400 transition-transform ${accountMenu ? 'rotate-180' : ''}`}>expand_less</span>
            </button>

            {accountMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAccountMenu(false)} />
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-neutral-200 rounded-2xl shadow-xl z-40 py-2 overflow-hidden">
                  <button
                    onClick={() => { setShowAccount(true); setAccountMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px] text-neutral-500">account_circle</span>
                    Chi tiết tài khoản
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">logout</span>
                    Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
        {/* Top Header */}
        <header className="h-[72px] bg-white/80 backdrop-blur-md border-b border-neutral-200/60 px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="text-emerald-700 font-semibold text-sm">
            FoodResQ Admin
          </div>
          <div className="flex items-center gap-4 text-neutral-600">
            <NotificationBell />
            <button
              onClick={() => setShowAccount(true)}
              title="Chi tiết tài khoản"
              className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-sm shadow-sm hover:ring-2 hover:ring-emerald-300 transition-all"
            >
              {user?.fullName?.[0]?.toUpperCase() || 'A'}
            </button>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'map' && <MapTab />}
          {tab === 'donations' && <DonationsTab />}
          {tab === 'campaigns' && <CampaignsAdminTab />}
          {tab === 'food' && <FoodAdminTab />}
          {tab === 'volunteers' && <VerifyTab />}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'monitor' && <MonitorTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>

      {showAccount && <AccountModal onClose={() => setShowAccount(false)} onLogout={handleLogout} />}
    </div>
  );
}

function AccountModal({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const { user } = useAuthStore();
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#fcfcfc] rounded-3xl border border-neutral-150 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-150 bg-white">
          <h2 className="font-extrabold text-[22px] text-emerald-800 tracking-tight">Chi tiết tài khoản</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-500 transition-colors"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-700">person</span> Hồ sơ cá nhân
            </h3>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-full bg-orange-50 border-[4px] border-white shadow-md flex items-center justify-center overflow-hidden">
                  <img 
                    src="/avatar-placeholder.png" 
                    alt="Avatar" 
                    className="w-full h-full object-cover" 
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${user?.fullName || 'Admin'}&background=fef08a&color=713f12&size=100`;
                    }} 
                  />
                </div>
                <button className="absolute bottom-0 right-0 w-7 h-7 bg-emerald-700 text-white rounded-full flex items-center justify-center shadow-sm border-2 border-white hover:bg-emerald-800 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                </button>
              </div>
              <div className="flex-1 space-y-4 w-full">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Họ và tên</label>
                  <input 
                    type="text" 
                    value={user?.fullName || 'Nguyễn Minh Anh'} 
                    readOnly 
                    className="w-full bg-neutral-100 border-none rounded-xl px-4 py-3 text-sm font-medium text-neutral-900 outline-none cursor-default" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Email</label>
                  <input 
                    type="email" 
                    value={user?.email || 'minhanh.foodresq@gmail.com'} 
                    readOnly 
                    className="w-full bg-neutral-100 border-none rounded-xl px-4 py-3 text-sm font-medium text-neutral-900 outline-none cursor-default" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-700">notifications_active</span> Thông báo
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <div>
                  <p className="font-bold text-sm text-neutral-900">Thông báo khi có quyên góp mới</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Nhận thông tin ngay lập tức khi các nhà hàng cập nhật thực phẩm</p>
                </div>
                <button onClick={() => setNotifyNew(!notifyNew)} className={`w-11 h-6 rounded-full relative transition-colors ${notifyNew ? 'bg-emerald-700' : 'bg-neutral-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${notifyNew ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-neutral-900">Báo cáo tuần</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Tổng kết dữ liệu cứu trợ và tác động cộng đồng hàng tuần</p>
                </div>
                <button onClick={() => setNotifyWeekly(!notifyWeekly)} className={`w-11 h-6 rounded-full relative transition-colors ${notifyWeekly ? 'bg-emerald-700' : 'bg-neutral-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${notifyWeekly ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-neutral-150 flex items-center justify-between">
          <button 
            onClick={onLogout} 
            className="flex items-center gap-2 px-5 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-bold transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span> Đăng xuất
          </button>
          <button 
            onClick={() => { toast.success('Đã lưu thay đổi'); onClose(); }} 
            className="flex items-center gap-2 px-6 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">save</span> Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[20px] text-neutral-500">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-neutral-900 truncate">{value}</p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// DASHBOARD TAB
// ----------------------------------------------------------------------
function DashboardTab() {
  const { data, isLoading } = useAdminOverview();

  if (isLoading || !data) return <Skeleton />;

  const totalCatKg = data.categories.reduce((s, c) => s + c.kg, 0) || 1;
  const maxTrend = Math.max(1, ...data.trend.map((t) => t.kg));
  const goalPct = Math.min(100, Math.round((data.kgRescued / MONTH_TARGET_KG) * 100));

  // Donut: dựng từ danh mục thật bằng conic-gradient
  let acc = 0;
  const segments = data.categories.map((c) => {
    const start = (acc / totalCatKg) * 360;
    acc += c.kg;
    const end = (acc / totalCatKg) * 360;
    return { ...c, start, end, color: CATEGORY_COLOR[c.category] ?? '#a8a29e' };
  });
  const conic = segments.length
    ? `conic-gradient(${segments.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(', ')})`
    : 'conic-gradient(#e5e7eb 0deg 360deg)';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-emerald-800 tracking-tight">Tổng quan Thống kê</h2>
        <p className="text-sm text-neutral-500 mt-1">Dữ liệu thật, tổng hợp toàn hệ thống cứu trợ thực phẩm.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon="eco" tone="emerald" label="Thực phẩm đã cứu trợ" value={fmtKg(data.kgRescued)} />
        <StatCard icon="group" tone="honey" label="Người dùng" value={data.users.toLocaleString('vi-VN')} sub={`${data.providers} cửa hàng · ${data.volunteers} TNV`} />
        <StatCard icon="cloud" tone="emerald" label="CO₂ tránh được" value={`${data.co2SavedKg.toLocaleString('vi-VN')} kg`} sub={`${data.mealsServed} bữa ăn đã trao`} />
        <StatCard icon="warning" tone={data.pendingReports > 0 ? 'rose' : 'neutral'} label="Khiếu nại chờ xử lý" value={`${data.pendingReports} mục`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Xu hướng theo tháng — bar thật */}
        <div className="lg:col-span-2 bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-lg text-neutral-900">Tác động theo thời gian</h3>
            <span className="text-xs bg-neutral-100 px-3 py-1 rounded-full font-semibold text-neutral-600">6 tháng gần đây</span>
          </div>
          {data.trend.length === 0 ? (
            <div className="flex-1 min-h-[200px] flex items-center justify-center text-sm text-neutral-400">Chưa có dữ liệu cứu trợ hoàn tất</div>
          ) : (
            <>
              <div className="relative flex-1 min-h-[200px] w-full border-b border-neutral-100 mt-4">
                {/* Grid lines */}
                <div className="absolute top-0 w-full border-b border-neutral-100" />
                <div className="absolute top-1/4 w-full border-b border-neutral-100" />
                <div className="absolute top-2/4 w-full border-b border-neutral-100" />
                <div className="absolute top-3/4 w-full border-b border-neutral-100" />
                
                {/* SVG Area Chart */}
                <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  <polygon 
                    points={`0,100 ${data.trend.map((t, i) => {
                      const x = data.trend.length > 1 ? (i / (data.trend.length - 1)) * 100 : 50;
                      const y = 100 - Math.max(0, (t.kg / maxTrend) * 90); // 90 to leave top margin
                      return `${x},${y}`;
                    }).join(' ')} 100,100`} 
                    fill="url(#area-gradient)" 
                  />
                  
                  <polyline 
                    points={data.trend.map((t, i) => {
                      const x = data.trend.length > 1 ? (i / (data.trend.length - 1)) * 100 : 50;
                      const y = 100 - Math.max(0, (t.kg / maxTrend) * 90);
                      return `${x},${y}`;
                    }).join(' ')} 
                    fill="none" 
                    stroke="#059669" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                  
                  {data.trend.map((t, i) => {
                    const x = data.trend.length > 1 ? (i / (data.trend.length - 1)) * 100 : 50;
                    const y = 100 - Math.max(0, (t.kg / maxTrend) * 90);
                    return <circle key={i} cx={x} cy={y} r="2.5" fill="#fff" stroke="#059669" strokeWidth="1.5" />;
                  })}
                </svg>
                
                {/* Tooltips Overlay */}
                {data.trend.map((t, i) => {
                  const x = data.trend.length > 1 ? (i / (data.trend.length - 1)) * 100 : 50;
                  const y = 100 - Math.max(0, (t.kg / maxTrend) * 90);
                  return (
                    <div key={i} className="absolute w-8 h-8 -ml-4 -mt-4 flex justify-center group cursor-pointer z-10" style={{ left: `${x}%`, top: `${y}%` }}>
                      <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900 text-white text-[10px] py-1 px-2 rounded-md font-bold whitespace-nowrap shadow-lg">
                        {fmtKg(t.kg)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-xs font-medium text-neutral-500">
                {data.trend.map((t) => (
                  <span key={t.ym} className="text-center w-8 -ml-4 first:ml-0 last:mr-0">Thg {Number(t.ym.split('-')[1])}</span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Phân bổ danh mục — donut thật */}
        <div className="bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm flex flex-col items-center">
          <h3 className="font-bold text-lg text-neutral-900 w-full text-left mb-6">Phân bổ danh mục</h3>
          {data.categories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-400 py-10">Chưa có dữ liệu</div>
          ) : (
            <>
              <div className="relative w-40 h-40 rounded-full" style={{ background: conic }}>
                <div className="absolute inset-[16px] bg-white rounded-full flex flex-col items-center justify-center">
                  <p className="font-extrabold text-2xl text-neutral-900">{fmtKg(Math.round(totalCatKg))}</p>
                  <p className="text-[9px] font-bold text-neutral-500">Tổng đã cứu</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-8 text-xs font-semibold text-neutral-700 w-full px-2">
                {segments.map((s) => (
                  <div key={s.category} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    {CATEGORY_LABEL[s.category] ?? s.category} ({Math.round((s.kg / totalCatKg) * 100)}%)
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Phễu trạng thái quyên góp — thật */}
      <div className="bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-lg text-neutral-900 mb-6">Trạng thái đơn nhận</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FunnelCard icon="task_alt" color="sky" label="Đã xác nhận" value={data.donations.confirmed} />
          <FunnelCard icon="hourglass_top" color="honey" label="Chờ bàn giao" value={data.donations.pickedUp} />
          <FunnelCard icon="check_circle" color="emerald" label="Hoàn tất" value={data.donations.completed} />
          <FunnelCard icon="cancel" color="rose" label="Huỷ / không đến" value={data.donations.cancelled} />
        </div>
      </div>

      {/* Mục tiêu cộng đồng — tiến độ thật */}
      <div className="bg-[#fdfaeb] border border-[#f5ead2] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-neutral-900">Mục tiêu Cộng đồng</h3>
          <p className="text-sm text-neutral-600 mt-1">Mục tiêu cứu trợ {MONTH_TARGET_KG.toLocaleString('vi-VN')} kg thực phẩm.</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="w-full md:w-80 h-6 bg-neutral-200 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full bg-[#86efac] flex items-center justify-end pr-2 text-[10px] font-bold text-emerald-900 transition-all" style={{ width: `${Math.max(8, goalPct)}%` }}>
              {goalPct}%
            </div>
          </div>
          <p className="font-extrabold text-xl text-emerald-800 whitespace-nowrap">{data.kgRescued.toLocaleString('vi-VN')} / {MONTH_TARGET_KG.toLocaleString('vi-VN')} kg</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, tone, label, value, sub }: { icon: string; tone: 'emerald' | 'honey' | 'rose' | 'neutral'; label: string; value: string; sub?: string }) {
  const toneCls: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    honey: 'bg-honey-100 text-honey-700',
    rose: 'bg-rose-50 text-rose-500',
    neutral: 'bg-neutral-100 text-neutral-500',
  };
  return (
    <div className="bg-white border border-neutral-150 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${toneCls[tone]}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <p className="text-xs font-semibold text-neutral-500 mb-1 mt-4">{label}</p>
      <p className="text-2xl font-extrabold text-neutral-900">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-1">{sub}</p>}
    </div>
  );
}

function FunnelCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: number }) {
  const cls: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600', honey: 'bg-honey-50 text-honey-600',
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-500',
  };
  return (
    <div className="border border-neutral-150 rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls[color]}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-neutral-900 leading-none">{value}</p>
        <p className="text-[11px] font-semibold text-neutral-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// MAP TAB (Mockup)
// ----------------------------------------------------------------------
function MapTab() {
  const { data: listings } = useListings({ lat: HCM_CENTER.lat, lng: HCM_CENTER.lng, radiusKm: 50 });
  const { data: recent } = useRecentReservations(8);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Bản đồ trực tiếp</h2>
        <p className="text-sm text-neutral-500 mt-1">{listings?.length ?? 0} điểm thực phẩm đang hoạt động tại TP.HCM (dữ liệu thật).</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bản đồ Leaflet thật */}
        <div className="lg:col-span-2 h-[600px] rounded-3xl overflow-hidden border border-neutral-200 shadow-sm">
          <AdminMap
            listings={listings ?? []}
            center={HCM_CENTER}
            selectedId={null}
            onSelect={() => {}}
          />
        </div>

        {/* Hoạt động gần đây — thật */}
        <div className="bg-white rounded-3xl shadow-sm border border-neutral-150 p-6 h-[600px] flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-extrabold text-lg text-neutral-900">Hoạt động gần đây</h3>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 -mr-2 pr-2">
            {!recent || recent.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-10">Chưa có hoạt động</p>
            ) : (
              recent.map((ev) => {
                const st = RES_STATUS_META[ev.status] ?? { label: ev.status, cls: 'bg-neutral-100 text-neutral-600', icon: 'help' };
                return (
                  <div key={ev.id} className="flex gap-3 bg-neutral-50/80 p-3 rounded-2xl border border-neutral-100">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${st.cls}`}>
                      <span className="material-symbols-outlined text-[16px]">{st.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">{ev.title}</p>
                      <p className="text-xs text-neutral-600 mt-0.5 truncate">{ev.provider} → {ev.receiver}</p>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium">{new Date(ev.createdAt).toLocaleString('vi-VN')} · {st.label}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// DONATIONS TAB
// ----------------------------------------------------------------------
const RES_STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  confirmed: { label: 'Đã xác nhận', cls: 'bg-sky-100 text-sky-700', icon: 'task_alt' },
  picked_up: { label: 'Chờ bàn giao', cls: 'bg-honey-100 text-honey-800', icon: 'hourglass_top' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-100 text-emerald-800', icon: 'check_circle' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-100 text-neutral-600', icon: 'cancel' },
  no_show: { label: 'Không đến', cls: 'bg-rose-100 text-rose-700', icon: 'person_off' },
  expired: { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-600', icon: 'schedule' },
};
const CAT_ICON: Record<string, string> = {
  cooked_meal: 'restaurant', bakery: 'bakery_dining', fresh_fruit: 'nutrition', beverage: 'local_cafe',
  vegetables: 'eco', raw_protein: 'set_meal', dry_goods: 'grain', canned_packaged: 'inventory_2', other: 'lunch_dining',
};

function DonationsTab() {
  const { data: ov } = useAdminOverview();
  const { data: rows, isLoading } = useRecentReservations(50);
  const paged = usePaged(rows ?? [], 8);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý Quyên góp</h2>
        <p className="text-sm text-neutral-500 mt-1">Theo dõi nguồn thực phẩm hỗ trợ cộng đồng (số liệu thật).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <DonStat icon="assignment" label="Đã xác nhận" value={ov?.donations.confirmed ?? 0} />
        <DonStat icon="hourglass_top" label="Chờ bàn giao" value={ov?.donations.pickedUp ?? 0} />
        <DonStat icon="check_circle" label="Hoàn thành" value={ov?.donations.completed ?? 0} />
        <div className="bg-[#166534] rounded-3xl p-6 shadow-sm flex items-center gap-4 text-white">
          <div className="w-12 h-12 rounded-xl bg-[#14532d] text-emerald-100 flex items-center justify-center">
            <span className="material-symbols-outlined">kitchen</span>
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-200 tracking-widest uppercase">Tổng khối lượng</p>
            <p className="text-xl font-extrabold text-white">{(ov?.kgRescued ?? 0).toLocaleString('vi-VN')} kg</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
        <div className="p-4 flex items-center gap-3 pl-4">
          <span className="material-symbols-outlined text-emerald-700">list_alt</span>
          <h3 className="font-bold text-lg text-neutral-900">Đơn nhận gần đây</h3>
        </div>
        {isLoading ? (
          <div className="p-4"><Skeleton /></div>
        ) : !rows || rows.length === 0 ? (
          <Empty icon="inbox" text="Chưa có đơn nhận nào" />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[640px]">
              <thead className="text-neutral-500 font-semibold text-[13px]">
                <tr>
                  <th className="px-6 py-4 font-semibold w-[34%]">Thực phẩm</th>
                  <th className="px-6 py-4 font-semibold">Số lượng</th>
                  <th className="px-6 py-4 font-semibold">Người nhận</th>
                  <th className="px-6 py-4 font-semibold">Ngày</th>
                  <th className="px-6 py-4 font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((r) => {
                  const st = RES_STATUS_META[r.status] ?? { label: r.status, cls: 'bg-neutral-100 text-neutral-600', icon: 'help' };
                  return (
                    <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-[#f0fdf4] flex items-center justify-center text-emerald-700 shrink-0">
                            <span className="material-symbols-outlined text-[20px]">{CAT_ICON[r.category] ?? 'lunch_dining'}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-neutral-900 truncate">{r.title}</p>
                            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{r.provider}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-neutral-100 px-4 py-1.5 rounded-full text-xs font-bold text-neutral-700 whitespace-nowrap">{r.quantity} {r.quantityUnit}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-neutral-800 truncate max-w-[160px]">{r.receiver}</td>
                      <td className="px-6 py-4 text-neutral-600 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit ${st.cls}`}>
                          <span className="material-symbols-outlined text-[14px]">{st.icon}</span>{st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function DonStat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-white border border-neutral-150 rounded-3xl p-6 shadow-sm flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-[#f0fdf4] text-emerald-600 flex items-center justify-center">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-black text-neutral-500 tracking-widest uppercase">{label}</p>
        <p className="text-xl font-extrabold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// CAMPAIGNS TAB (Quản lý chiến dịch bếp ăn)
// ----------------------------------------------------------------------
const CAMPAIGN_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Chờ duyệt', cls: 'bg-honey-100 text-honey-800' },
  open: { label: 'Đang tuyển', cls: 'bg-sky-100 text-sky-700' },
  in_progress: { label: 'Đang diễn ra', cls: 'bg-honey-100 text-honey-800' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700' },
};
const CAMPAIGN_STATUS_OPTS: AdminCampaign['status'][] = ['draft', 'open', 'in_progress', 'completed', 'cancelled'];

function CampaignsAdminTab() {
  const [status, setStatus] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useAdminCampaigns(status || undefined);
  const setCampaignStatus = useSetCampaignStatus();
  const paged = usePaged(data ?? [], 8, status);

  async function changeStatus(id: string, st: AdminCampaign['status']) {
    try {
      await setCampaignStatus.mutateAsync({ id, status: st });
      toast.success(`Đã chuyển sang "${CAMPAIGN_STATUS_META[st].label}"`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Cập nhật thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý Chiến dịch</h2>
          <p className="text-sm text-neutral-500 mt-1">Giám sát chiến dịch bếp ăn, gán tình nguyện viên &amp; điều chỉnh trạng thái.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">add</span> Tạo chiến dịch
        </button>
      </div>

      {/* Đăng ký tình nguyện viên chờ duyệt */}
      <PendingAssignmentsPanel />

      {/* Yêu cầu thay đổi chờ duyệt */}
      <ChangeRequestsPanel />

      {/* Lọc trạng thái */}
      <div className="flex flex-wrap gap-2">
        {[{ v: '', l: 'Tất cả' }, ...CAMPAIGN_STATUS_OPTS.map((s) => ({ v: s, l: CAMPAIGN_STATUS_META[s].label }))].map((opt) => (
          <button
            key={opt.v}
            onClick={() => setStatus(opt.v)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              status === opt.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : !data || data.length === 0 ? (
        <Empty icon="soup_kitchen" text="Không có chiến dịch nào" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[760px]">
              <thead className="text-neutral-500 font-semibold text-[13px]">
                <tr>
                  <th className="px-6 py-4 w-[30%]">Chiến dịch</th>
                  <th className="px-6 py-4">Tổ chức</th>
                  <th className="px-6 py-4">Lịch</th>
                  <th className="px-6 py-4">Nhân lực</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Đổi trạng thái</th>
                  <th className="px-6 py-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((c) => {
                  const st = CAMPAIGN_STATUS_META[c.status] ?? { label: c.status, cls: 'bg-neutral-100 text-neutral-600' };
                  return (
                    <tr key={c.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#f0fdf4] flex items-center justify-center text-emerald-700 shrink-0">
                            <span className="material-symbols-outlined text-[20px]">soup_kitchen</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-neutral-900 truncate">{c.title}</p>
                            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{c.kitchenAddress}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-neutral-700 truncate max-w-[160px]">{c.charity}</td>
                      <td className="px-6 py-4 text-neutral-600 whitespace-nowrap">
                        {new Date(c.scheduledDate).toLocaleDateString('vi-VN')}<br />
                        <span className="text-[11px] text-neutral-400">{c.startTime}–{c.endTime}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="bg-neutral-100 px-3 py-1.5 rounded-full text-xs font-bold text-neutral-700">{c.slotsFilled}/{c.slotsNeeded}</span>
                        <span className="text-[11px] text-neutral-400 ml-2">{c.volunteers} TNV</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        {c.status === 'draft' ? (
                          // Yêu cầu chờ duyệt → nút Duyệt (mở) / Từ chối (huỷ) cho rõ
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => changeStatus(c.id, 'open')}
                              disabled={setCampaignStatus.isPending}
                              className="px-3 py-1.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              Duyệt
                            </button>
                            <button
                              onClick={() => changeStatus(c.id, 'cancelled')}
                              disabled={setCampaignStatus.isPending}
                              className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <select
                            value={c.status}
                            disabled={setCampaignStatus.isPending}
                            onChange={(e) => changeStatus(c.id, e.target.value as AdminCampaign['status'])}
                            className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                          >
                            {CAMPAIGN_STATUS_OPTS.filter((s) => s !== 'draft').map((s) => (
                              <option key={s} value={s}>{CAMPAIGN_STATUS_META[s].label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setDetailId(c.id)}
                          title="Xem danh sách tình nguyện viên"
                          className="w-9 h-9 rounded-full border border-neutral-200 inline-flex items-center justify-center text-neutral-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">groups</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}

      {detailId && <CampaignDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {showCreate && <CampaignFormModal mode="create" onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// Panel: các yêu cầu thay đổi chiến dịch đang chờ admin duyệt
function PendingAssignmentsPanel() {
  const { data, isLoading } = useAdminPendingAssignments();
  const items = data ?? [];
  if (isLoading || items.length === 0) return null;

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-3xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sky-700">how_to_reg</span>
        <h3 className="font-extrabold text-neutral-900">Đăng ký tình nguyện viên chờ duyệt ({items.length})</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((a) => <PendingAssignmentCard key={a.id} a={a} />)}
      </div>
    </div>
  );
}

function PendingAssignmentCard({ a }: { a: PendingAssignment }) {
  const review = useReviewAssignment();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const rm = ROLE_META_ADMIN[a.role] ?? { label: a.role, icon: 'work', cls: 'bg-neutral-100 text-neutral-600' };
  // TNV có đúng chuyên môn cho vai trò đăng ký không (cảnh báo cho admin)
  const matchesSpec = a.volunteer.specializations.includes(a.role);

  async function decide(decision: 'approve' | 'reject') {
    try {
      await review.mutateAsync({ id: a.id, decision, note: decision === 'reject' ? note.trim() || undefined : undefined });
      toast.success(decision === 'approve' ? 'Đã duyệt đăng ký' : 'Đã từ chối đăng ký');
      setRejecting(false); setNote('');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="bg-white border border-neutral-150 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-extrabold shrink-0">
          {a.volunteer.fullName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-neutral-900 truncate">{a.volunteer.fullName}</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${rm.cls}`}>
              <span className="material-symbols-outlined text-[13px]">{rm.icon}</span>{rm.label}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {a.volunteer.dedicationPoints} điểm cống hiến · Chuyên môn: {a.volunteer.specializations.map((s) => VOL_ROLE_LABEL[s] ?? s).join(', ') || 'chưa có'}
          </p>
          {!matchesSpec && (
            <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">warning</span> Chưa đăng ký chuyên môn {rm.label}
            </p>
          )}
          <p className="text-xs text-neutral-600 mt-1.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-emerald-600">soup_kitchen</span>
            <span className="font-semibold truncate">{a.campaign.title}</span>
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            {new Date(a.campaign.scheduledDate).toLocaleDateString('vi-VN')} · {a.campaign.startTime}–{a.campaign.endTime}
          </p>
        </div>
      </div>

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối (tuỳ chọn)"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm" autoFocus />
          <div className="flex gap-2">
            <button onClick={() => decide('reject')} disabled={review.isPending}
              className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">Xác nhận từ chối</button>
            <button onClick={() => setRejecting(false)} className="px-3 py-2 text-neutral-400 text-xs">Huỷ</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={() => decide('approve')} disabled={review.isPending}
            className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold disabled:opacity-50">Duyệt</button>
          <button onClick={() => setRejecting(true)} disabled={review.isPending}
            className="flex-1 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold disabled:opacity-50">Từ chối</button>
        </div>
      )}
    </div>
  );
}

function ChangeRequestsPanel() {
  const { data, isLoading } = useAdminCampaignChangeRequests('pending');
  const requests = data ?? [];
  if (isLoading || requests.length === 0) return null;

  return (
    <div className="bg-honey-50 border border-honey-200 rounded-3xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-honey-700">edit_note</span>
        <h3 className="font-extrabold text-neutral-900">Yêu cầu thay đổi chờ duyệt ({requests.length})</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {requests.map((r) => <ChangeRequestReviewCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}

// Một dòng diff: nhãn — giá trị cũ → giá trị mới
function DiffRow({ label, from, to }: { label: string; from: string | number; to: string | number }) {
  return (
    <li className="flex items-center gap-1.5 flex-wrap">
      <span className="material-symbols-outlined text-[14px] text-emerald-600">arrow_right</span>
      <span className="font-semibold text-neutral-700">{label}:</span>
      <span className="text-neutral-400 line-through">{from}</span>
      <span className="material-symbols-outlined text-[13px] text-neutral-400">east</span>
      <span className="font-bold text-emerald-700">{to}</span>
    </li>
  );
}

function ChangeRequestReviewCard({ r }: { r: AdminCampaignChangeRequest }) {
  const review = useReviewCampaignChange();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const c = r.campaign;

  const diffs: { label: string; from: string | number; to: string | number }[] = [];
  if (r.scheduledDate) diffs.push({ label: 'Ngày', from: new Date(c.scheduledDate).toLocaleDateString('vi-VN'), to: new Date(r.scheduledDate).toLocaleDateString('vi-VN') });
  if (r.startTime) diffs.push({ label: 'Giờ bắt đầu', from: c.startTime, to: r.startTime });
  if (r.endTime) diffs.push({ label: 'Giờ kết thúc', from: c.endTime, to: r.endTime });
  if (r.kitchenAddress) diffs.push({ label: 'Địa chỉ', from: c.kitchenAddress, to: r.kitchenAddress });
  if (r.chefSlotsNeeded != null) diffs.push({ label: 'Đầu bếp', from: c.chefSlotsNeeded, to: r.chefSlotsNeeded });
  if (r.waiterSlotsNeeded != null) diffs.push({ label: 'Phục vụ', from: c.waiterSlotsNeeded, to: r.waiterSlotsNeeded });
  if (r.shipperSlotsNeeded != null) diffs.push({ label: 'Giao hàng', from: c.shipperSlotsNeeded, to: r.shipperSlotsNeeded });

  async function decide(decision: 'approve' | 'reject') {
    try {
      await review.mutateAsync({ id: r.id, decision, reviewNote: decision === 'reject' ? note.trim() || undefined : undefined });
      toast.success(decision === 'approve' ? 'Đã duyệt & áp dụng thay đổi' : 'Đã từ chối yêu cầu');
      setRejecting(false); setNote('');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="bg-white border border-neutral-150 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 truncate">{c.title}</p>
          <p className="text-[11px] text-neutral-500 truncate">{c.charityReceiver?.organizationName ?? c.charityReceiver?.user.fullName ?? '—'}</p>
        </div>
        <span className="text-[10px] text-neutral-400 shrink-0">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
      </div>

      <ul className="mt-2.5 text-xs space-y-1">
        {diffs.map((d, i) => <DiffRow key={i} {...d} />)}
      </ul>
      {r.reason && <p className="mt-2 text-[11px] text-neutral-500 italic">“{r.reason}”</p>}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối (tuỳ chọn)"
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-300" autoFocus />
          <div className="flex gap-2">
            <button onClick={() => decide('reject')} disabled={review.isPending}
              className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors">
              {review.isPending ? 'Đang xử lý...' : 'Xác nhận từ chối'}
            </button>
            <button onClick={() => setRejecting(false)} className="px-3 py-2 text-neutral-400 text-xs">Huỷ</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={() => decide('approve')} disabled={review.isPending}
            className="flex-1 py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors">
            Duyệt &amp; áp dụng
          </button>
          <button onClick={() => setRejecting(true)} disabled={review.isPending}
            className="flex-1 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors">
            Từ chối
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// FOOD TAB (Quản lý & phân loại thức ăn)
// ----------------------------------------------------------------------
const LISTING_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-neutral-100 text-neutral-600' },
  active: { label: 'Đang mở', cls: 'bg-emerald-100 text-emerald-800' },
  fully_reserved: { label: 'Hết suất', cls: 'bg-honey-100 text-honey-800' },
  completed: { label: 'Hoàn tất', cls: 'bg-sky-100 text-sky-700' },
  expired: { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-500' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700' },
};
const FOOD_GROUP_TABS: { v: string; l: string }[] = [
  { v: '', l: 'Tất cả nhóm' },
  { v: FoodGroup.READY_TO_EAT, l: FOOD_GROUP_LABEL[FoodGroup.READY_TO_EAT] },
  { v: FoodGroup.RAW_INGREDIENT, l: FOOD_GROUP_LABEL[FoodGroup.RAW_INGREDIENT] },
  { v: FoodGroup.OTHER, l: FOOD_GROUP_LABEL[FoodGroup.OTHER] },
];

function FoodAdminTab() {
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminFoodListings({
    page,
    group: group || undefined,
    status: status || undefined,
    search: search.trim() || undefined,
  });
  const update = useUpdateListingCategory();

  function resetTo1<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  async function changeCategory(id: string, category: string) {
    try {
      await update.mutateAsync({ id, category });
      toast.success(`Đã đổi loại sang "${FOOD_CATEGORY_LABEL[category as FoodCategory]}"`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Đổi loại thất bại';
      toast.error(msg);
    }
  }

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý thức ăn</h2>
        <p className="text-sm text-neutral-500 mt-1">Xem và phân loại lại các tin thực phẩm theo nhóm ăn liền / nguyên liệu thô.</p>
      </div>

      {/* Lọc theo nhóm + trạng thái + tìm kiếm */}
      <div className="flex flex-wrap items-center gap-2">
        {FOOD_GROUP_TABS.map((g) => (
          <button key={g.v} onClick={() => resetTo1(setGroup)(g.v)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${group === g.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
            {g.l}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select value={status} onChange={(e) => resetTo1(setStatus)(e.target.value)}
            className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
            <option value="">Mọi trạng thái</option>
            {Object.entries(LISTING_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
          <div className="relative">
            <span className="material-symbols-outlined text-[18px] text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input value={search} onChange={(e) => resetTo1(setSearch)(e.target.value)} placeholder="Tìm tên món..."
              className="bg-white border border-neutral-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 w-44" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <Empty icon="restaurant_menu" text="Không có tin thực phẩm nào" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[760px]">
              <thead className="text-neutral-500 font-semibold text-[13px]">
                <tr>
                  <th className="px-6 py-4 w-[34%]">Món</th>
                  <th className="px-6 py-4">Nhà cung cấp</th>
                  <th className="px-6 py-4">Số lượng</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Phân loại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {items.map((it) => {
                  const st = LISTING_STATUS_META[it.status] ?? { label: it.status, cls: 'bg-neutral-100 text-neutral-600' };
                  return (
                    <tr key={it.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="min-w-0">
                          <p className="font-bold text-neutral-900 truncate">{it.title}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5">{it.groupLabel}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-neutral-600 truncate max-w-[160px]">{it.businessName ?? '—'}</td>
                      <td className="px-6 py-4 text-neutral-600 whitespace-nowrap">{it.quantityRemaining}/{it.quantityTotal} {it.quantityUnit}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={it.category}
                          disabled={update.isPending}
                          onChange={(e) => changeCategory(it.id, e.target.value)}
                          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer max-w-[230px]"
                        >
                          <optgroup label={FOOD_GROUP_LABEL[FoodGroup.READY_TO_EAT]}>
                            {FOOD_GROUP_CATEGORIES[FoodGroup.READY_TO_EAT].map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>)}
                          </optgroup>
                          <optgroup label={FOOD_GROUP_LABEL[FoodGroup.RAW_INGREDIENT]}>
                            {FOOD_GROUP_CATEGORIES[FoodGroup.RAW_INGREDIENT].map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>)}
                          </optgroup>
                          <optgroup label={FOOD_GROUP_LABEL[FoodGroup.OTHER]}>
                            {FOOD_GROUP_CATEGORIES[FoodGroup.OTHER].map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>)}
                          </optgroup>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} perPage={meta.limit} onChange={setPage} />}
        </div>
      )}
    </div>
  );
}

const ASSIGN_STATUS_META: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'Đã nhận việc', cls: 'bg-sky-100 text-sky-700' },
  checked_in: { label: 'Đã điểm danh', cls: 'bg-emerald-100 text-emerald-800' },
  in_progress: { label: 'Đang làm', cls: 'bg-honey-100 text-honey-800' },
  completed: { label: 'Hoàn thành', cls: 'bg-emerald-100 text-emerald-800' },
  absent: { label: 'Vắng', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-100 text-neutral-600' },
};
const ROLE_META_ADMIN: Record<string, { label: string; icon: string; cls: string }> = {
  chef: { label: 'Đầu bếp', icon: 'skillet', cls: 'bg-honey-100 text-honey-800' },
  waiter: { label: 'Phục vụ', icon: 'room_service', cls: 'bg-sky-100 text-sky-700' },
  shipper: { label: 'Giao hàng', icon: 'local_shipping', cls: 'bg-emerald-100 text-emerald-800' },
};

function CampaignDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: c, isLoading } = useAdminCampaignDetail(id);
  const [editing, setEditing] = useState(false);
  const unassign = useUnassignVolunteer();

  async function removeAssignment(assignmentId: string) {
    try {
      await unassign.mutateAsync({ assignmentId, campaignId: id });
      toast.success('Đã gỡ phân công');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Gỡ thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-neutral-150 w-full max-w-2xl my-8 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#166534] px-6 py-5 text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-extrabold text-lg truncate">{c?.title ?? 'Chi tiết chiến dịch'}</p>
            {c && <p className="text-xs text-emerald-100 mt-0.5">{c.charity}{c.charityPhone ? ` · ${c.charityPhone}` : ''}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {c && (
              <button onClick={() => setEditing(true)} title="Sửa chiến dịch" className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-bold inline-flex items-center gap-1 transition-colors">
                <span className="material-symbols-outlined text-[18px]">edit</span> Sửa
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/15 rounded-full"><span className="material-symbols-outlined">close</span></button>
          </div>
        </div>

        {isLoading || !c ? (
          <div className="p-6"><Skeleton /></div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Tổng quan */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <DetailStat icon="event" label="Ngày" value={new Date(c.scheduledDate).toLocaleDateString('vi-VN')} />
              <DetailStat icon="schedule" label="Giờ" value={`${c.startTime}–${c.endTime}`} />
              <DetailStat icon="restaurant" label="Suất dự kiến" value={c.expectedServings != null ? String(c.expectedServings) : '—'} />
              <DetailStat icon="flag" label="Trạng thái" value={CAMPAIGN_STATUS_META[c.status]?.label ?? c.status} />
            </div>
            <p className="text-sm text-neutral-600 flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">place</span>{c.kitchenAddress}
            </p>
            {c.description && <p className="text-sm text-neutral-500 bg-neutral-50 rounded-xl p-3">{c.description}</p>}

            {/* Slots theo vai trò */}
            <div className="grid grid-cols-3 gap-3">
              {(['chef', 'waiter', 'shipper'] as const).map((r) => {
                const rm = ROLE_META_ADMIN[r];
                const s = c.slots[r];
                return (
                  <div key={r} className="border border-neutral-150 rounded-2xl p-3 text-center">
                    <span className={`material-symbols-outlined text-[20px] ${rm.cls} rounded-lg p-1`}>{rm.icon}</span>
                    <p className="text-xs font-bold text-neutral-700 mt-1.5">{rm.label}</p>
                    <p className="text-sm font-extrabold text-neutral-900">{s.filled}/{s.needed}</p>
                  </div>
                );
              })}
            </div>

            {/* Danh sách TNV */}
            <div>
              <h4 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">groups</span>
                Tình nguyện viên ({c.assignments.length})
              </h4>

              {/* Gán TNV mới */}
              <AssignSection campaignId={c.id} />

              {c.assignments.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-8 bg-neutral-50 rounded-2xl">Chưa có tình nguyện viên</p>
              ) : (
                <div className="space-y-2">
                  {c.assignments.map((a) => {
                    const rm = ROLE_META_ADMIN[a.role] ?? { label: a.role, icon: 'work', cls: 'bg-neutral-100 text-neutral-600' };
                    const st = ASSIGN_STATUS_META[a.status] ?? { label: a.status, cls: 'bg-neutral-100 text-neutral-600' };
                    return (
                      <div key={a.id} className="flex items-center gap-3 border border-neutral-150 rounded-2xl p-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {a.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-neutral-900 truncate">{a.fullName}</p>
                          <p className="text-[11px] text-neutral-500">
                            {a.phone ?? 'Không có SĐT'}
                            {a.checkInTime && ` · điểm danh ${new Date(a.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
                            {a.pointsAwarded != null && ` · +${a.pointsAwarded}đ`}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 shrink-0 ${rm.cls}`}>
                          <span className="material-symbols-outlined text-[13px]">{rm.icon}</span>{rm.label}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${st.cls}`}>{st.label}</span>
                        <button
                          onClick={() => removeAssignment(a.id)}
                          disabled={unassign.isPending}
                          title="Gỡ phân công"
                          className="w-7 h-7 rounded-full text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {editing && c && <CampaignFormModal mode="edit" campaign={c} onClose={() => setEditing(false)} />}
    </div>
  );
}

const ROLE_VN_MAP: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

function AssignSection({ campaignId }: { campaignId: string }) {
  const [role, setRole] = useState<'chef' | 'waiter' | 'shipper'>('chef');
  const [volId, setVolId] = useState('');
  const [override, setOverride] = useState(false);
  // override → lấy tất cả TNV; mặc định → lọc đúng chuyên môn
  const { data: vols, isLoading } = useAdminVolunteers(override ? undefined : role);
  const assign = useAssignVolunteer();

  async function doAssign() {
    if (!volId) { toast.error('Chọn tình nguyện viên'); return; }
    try {
      await assign.mutateAsync({ campaignId, volunteerId: volId, role, override });
      toast.success('Đã gán tình nguyện viên');
      setVolId('');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Gán thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="bg-neutral-50 border border-neutral-150 rounded-2xl p-3 mb-3 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value as 'chef' | 'waiter' | 'shipper'); setVolId(''); }}
          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="chef">Đầu bếp</option>
          <option value="waiter">Phục vụ</option>
          <option value="shipper">Giao hàng</option>
        </select>
        <select
          value={volId}
          onChange={(e) => setVolId(e.target.value)}
          className="flex-1 bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">{isLoading ? 'Đang tải...' : (vols && vols.length ? '— Chọn tình nguyện viên —' : 'Không có TNV phù hợp')}</option>
          {(vols ?? []).map((v) => (
            <option key={v.volunteerId} value={v.volunteerId}>
              {v.fullName}{override && v.specializations.length ? ` (${v.specializations.map((s) => ROLE_VN_MAP[s] ?? s).join(', ')})` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={doAssign}
          disabled={assign.isPending || !volId}
          className="px-4 py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1 disabled:opacity-40 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span> Gán
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-neutral-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={override}
          onChange={(e) => { setOverride(e.target.checked); setVolId(''); }}
          className="w-4 h-4 rounded accent-emerald-600"
        />
        Gán vượt chuyên môn (cho phép chọn mọi tình nguyện viên)
      </label>
    </div>
  );
}

function CampaignFormModal({ mode, campaign, onClose }: { mode: 'create' | 'edit'; campaign?: AdminCampaignDetail; onClose: () => void }) {
  const { data: charities } = useAdminCharities();
  const create = useCreateAdminCampaign();
  const update = useUpdateAdminCampaign();
  const pending = create.isPending || update.isPending;

  const [f, setF] = useState({
    charityReceiverId: '',
    title: campaign?.title ?? '',
    description: campaign?.description ?? '',
    kitchenAddress: campaign?.kitchenAddress ?? '',
    scheduledDate: campaign ? campaign.scheduledDate.slice(0, 10) : new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startTime: (campaign?.startTime ?? '08:00').slice(0, 5),
    endTime: (campaign?.endTime ?? '12:00').slice(0, 5),
    chefSlotsNeeded: campaign?.slots.chef.needed ?? 2,
    waiterSlotsNeeded: campaign?.slots.waiter.needed ?? 3,
    shipperSlotsNeeded: campaign?.slots.shipper.needed ?? 2,
    expectedServings: campaign?.expectedServings ?? 100,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 5) { toast.error('Tiêu đề tối thiểu 5 ký tự'); return; }
    if (f.kitchenAddress.trim().length < 5) { toast.error('Địa chỉ bếp tối thiểu 5 ký tự'); return; }
    try {
      if (mode === 'create') {
        if (!f.charityReceiverId) { toast.error('Chọn tổ chức chủ chiến dịch'); return; }
        await create.mutateAsync({ ...f });
        toast.success('Đã tạo chiến dịch');
      } else {
        const { charityReceiverId: _omit, ...rest } = f;
        await update.mutateAsync({ id: campaign!.id, input: rest });
        toast.success('Đã cập nhật chiến dịch');
      }
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl border border-neutral-150 w-full max-w-lg my-8 shadow-2xl overflow-hidden">
        <div className="bg-[#166534] px-6 py-5 text-white flex items-center gap-3">
          <span className="material-symbols-outlined">{mode === 'create' ? 'add_circle' : 'edit'}</span>
          <h3 className="font-extrabold text-lg">{mode === 'create' ? 'Tạo chiến dịch' : 'Sửa chiến dịch'}</h3>
        </div>
        <div className="p-6 space-y-4">
          {mode === 'create' && (
            <div>
              <label className="text-xs font-bold text-neutral-500">Tổ chức / Người nhận (chủ chiến dịch) *</label>
              <select value={f.charityReceiverId} onChange={(e) => setF({ ...f, charityReceiverId: e.target.value })} className="input-base mt-1" required>
                <option value="">— Chọn tổ chức —</option>
                {(charities ?? []).map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}{ch.isCharityOrg ? ' (tổ chức)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Tiêu đề *" className="input-base" required minLength={5} />
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Mô tả" rows={2} className="input-base" />
          <input value={f.kitchenAddress} onChange={(e) => setF({ ...f, kitchenAddress: e.target.value })} placeholder="Địa chỉ bếp *" className="input-base" required minLength={5} />
          <div className="grid grid-cols-3 gap-3">
            <input type="date" value={f.scheduledDate} onChange={(e) => setF({ ...f, scheduledDate: e.target.value })} className="input-base" required />
            <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className="input-base" required />
            <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className="input-base" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-bold text-honey-700 block">Đầu bếp<input type="number" min={0} value={f.chefSlotsNeeded} onChange={(e) => setF({ ...f, chefSlotsNeeded: Number(e.target.value) })} className="input-base mt-1" /></label>
            <label className="text-xs font-bold text-sky-700 block">Phục vụ<input type="number" min={0} value={f.waiterSlotsNeeded} onChange={(e) => setF({ ...f, waiterSlotsNeeded: Number(e.target.value) })} className="input-base mt-1" /></label>
            <label className="text-xs font-bold text-emerald-700 block">Giao hàng<input type="number" min={0} value={f.shipperSlotsNeeded} onChange={(e) => setF({ ...f, shipperSlotsNeeded: Number(e.target.value) })} className="input-base mt-1" /></label>
          </div>
          <label className="text-xs font-bold text-neutral-500 block">Suất ăn dự kiến<input type="number" min={0} value={f.expectedServings} onChange={(e) => setF({ ...f, expectedServings: Number(e.target.value) })} className="input-base mt-1" /></label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors">Huỷ</button>
            <button type="submit" disabled={pending} className="flex-1 py-3 bg-[#166534] hover:bg-[#14532d] text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-colors">{pending ? 'Đang lưu...' : (mode === 'create' ? 'Tạo chiến dịch' : 'Lưu thay đổi')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function DetailStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-neutral-50 rounded-2xl p-3 text-center">
      <span className="material-symbols-outlined text-[18px] text-neutral-400">{icon}</span>
      <p className="text-[10px] font-bold text-neutral-400 uppercase mt-0.5">{label}</p>
      <p className="text-sm font-extrabold text-neutral-900 mt-0.5">{value}</p>
    </div>
  );
}

// ----------------------------------------------------------------------
// VERIFY / VOLUNTEERS TAB
// ----------------------------------------------------------------------
const VERIF_META: Record<string, { label: string; cls: string }> = {
  verified: { label: 'Đã xác minh', cls: 'badge-emerald' },
  pending: { label: 'Chờ xác minh', cls: 'badge-honey' },
  rejected: { label: 'Bị từ chối', cls: 'badge-rose' },
};
const ACCOUNT_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'Hoạt động', cls: 'badge-emerald' },
  suspended: { label: 'Hạn chế', cls: 'badge-honey' },
  banned: { label: 'Đã khoá', cls: 'badge-rose' },
  pending_verification: { label: 'Chờ duyệt', cls: 'badge-neutral' },
};

function VerifyTab() {
  const { data: pending, isLoading: pendingLoading } = useVerifications();
  const { data: vols, isLoading: volsLoading } = useVolunteersManage();
  const review = useReviewVerification();

  const pendingPaged = usePaged(pending ?? [], 5);
  const volPaged = usePaged(vols ?? [], 6);

  async function act(type: string, id: string, decision: 'approved' | 'rejected') {
    try {
      await review.mutateAsync({ type, id, decision });
      toast.success(decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối');
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý Tình nguyện viên &amp; Cửa hàng</h2>
        <p className="text-sm text-neutral-500 mt-1">Duyệt hồ sơ mới và theo dõi tình nguyện viên đang hoạt động.</p>
      </div>

      {/* Hồ sơ chờ duyệt */}
      <section className="space-y-3">
        <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-honey-500">how_to_reg</span>
          Hồ sơ chờ duyệt ({pending?.length ?? 0})
        </h3>
        {pendingLoading ? (
          <Skeleton />
        ) : !pending || pending.length === 0 ? (
          <Empty icon="verified_user" text="Không có hồ sơ chờ duyệt" />
        ) : (
          <>
            <div className="space-y-3">
              {pendingPaged.slice.map((v) => (
                <div key={`${v.type}-${v.profileId}`} className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${v.type === 'provider' ? 'bg-[#a7f3d0] text-emerald-900' : 'bg-[#fef08a] text-[#713f12]'}`}>
                        {v.type === 'provider' ? 'Cửa hàng' : 'TNV'}
                      </span>
                      <h3 className="font-bold text-neutral-900 truncate">{v.fullName}</h3>
                    </div>
                    <p className="text-sm text-neutral-500 mt-2 truncate">{v.email}{v.phone ? ` · ${v.phone}` : ''}</p>
                    <p className="text-sm text-neutral-600 mt-1 truncate bg-neutral-50 p-2 rounded-lg">{v.detail}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => act(v.type, v.profileId, 'rejected')} disabled={review.isPending}
                      className="px-6 py-2.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-full text-sm font-bold disabled:opacity-50 transition-colors">Từ chối</button>
                    <button onClick={() => act(v.type, v.profileId, 'approved')} disabled={review.isPending}
                      className="px-6 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full text-sm font-bold disabled:opacity-50 shadow-sm transition-colors">Duyệt</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white border border-neutral-150 rounded-2xl">
              <Pagination page={pendingPaged.page} totalPages={pendingPaged.totalPages} total={pendingPaged.total} perPage={pendingPaged.perPage} onChange={pendingPaged.setPage} />
            </div>
          </>
        )}
      </section>

      {/* Tình nguyện viên đang hoạt động */}
      <section className="space-y-3">
        <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600">groups</span>
          Tình nguyện viên ({vols?.length ?? 0})
        </h3>
        {volsLoading ? (
          <Skeleton />
        ) : !vols || vols.length === 0 ? (
          <Empty icon="group" text="Chưa có tình nguyện viên nào" />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {volPaged.slice.map((v) => <VolunteerCard key={v.volunteerId} v={v} />)}
            </div>
            <div className="bg-white border border-neutral-150 rounded-2xl">
              <Pagination page={volPaged.page} totalPages={volPaged.totalPages} total={volPaged.total} perPage={volPaged.perPage} onChange={volPaged.setPage} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function VolunteerCard({ v }: { v: VolunteerDetail }) {
  const verif = VERIF_META[v.verificationStatus] ?? { label: v.verificationStatus, cls: 'badge-neutral' };
  const acc = ACCOUNT_META[v.accountStatus] ?? { label: v.accountStatus, cls: 'badge-neutral' };
  return (
    <div className="card-interactive bg-white border border-neutral-150 rounded-2xl p-4 elevation-1">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg shrink-0 relative">
          {v.fullName.charAt(0).toUpperCase()}
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${v.isAvailable ? 'bg-emerald-500' : 'bg-neutral-300'}`} title={v.isAvailable ? 'Đang sẵn sàng' : 'Đang tắt'} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-neutral-900 truncate">{v.fullName}</h4>
            <span className={`badge ${acc.cls}`}>{acc.label}</span>
          </div>
          <p className="text-xs text-neutral-500 truncate mt-0.5">{v.email}{v.phone ? ` · ${v.phone}` : ''}</p>
        </div>
      </div>

      {/* Chuyên môn */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {v.specializations.length === 0 ? (
          <span className="text-[11px] text-neutral-400">Chưa khai báo chuyên môn</span>
        ) : v.specializations.map((s) => {
          const rm = ROLE_META_ADMIN[s.specialization];
          return (
            <span key={s.specialization} className={`badge ${s.isVerified ? rm.cls : 'badge-neutral'}`}>
              <span className="material-symbols-outlined text-[13px]">{rm.icon}</span>
              {rm.label}{!s.isVerified && ' (chờ duyệt)'}
            </span>
          );
        })}
      </div>

      {/* Số liệu */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-500">
        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px] text-honey-500">military_tech</span>{v.dedicationPoints}đ</span>
        {v.avgRating != null && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px] text-amber-400">star</span>{v.avgRating.toFixed(1)}</span>}
        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">soup_kitchen</span>{v.campaigns}</span>
        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">local_shipping</span>{v.deliveries}</span>
        <span className={`badge ${verif.cls} ml-auto`}>{verif.label}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// REPORTS TAB (Xử lý khiếu nại)
// ----------------------------------------------------------------------
function ReportsTab() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useAdminReports(status || undefined);
  const { data: ov } = useAdminOverview();
  const resolve = useResolveReport();
  const paged = usePaged(data ?? [], 8, status);

  async function act(id: string, st: 'resolved' | 'dismissed') {
    try {
      await resolve.mutateAsync({ id, status: st });
      toast.success(st === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua');
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-emerald-700 mb-2">Hệ thống / Xử lý khiếu nại</div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Danh sách Khiếu nại</h2>
        </div>
        <div className="flex gap-4">
          <div className="bg-[#f9faf9] border border-neutral-150 px-6 py-4 rounded-3xl shadow-sm text-center min-w-[140px]">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Tổng khiếu nại</p>
            <p className="text-2xl font-extrabold text-emerald-800 mt-1">{ov?.reports.total ?? 0}</p>
          </div>
          <div className="bg-[#fef2f2] border border-[#fecaca] px-6 py-4 rounded-3xl shadow-sm text-center min-w-[140px]">
            <p className="text-[10px] font-bold text-[#b91c1c] uppercase tracking-widest">Đang chờ xử lý</p>
            <p className="text-2xl font-extrabold text-[#b91c1c] mt-1">{ov?.reports.pending ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Bộ lọc trạng thái (hoạt động thật) */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: '', l: 'Tất cả' },
          { v: 'pending', l: 'Đang chờ' },
          { v: 'resolved', l: 'Đã xử lý' },
          { v: 'dismissed', l: 'Đã bỏ qua' },
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => setStatus(opt.v)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              status === opt.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : !data || data.length === 0 ? (
        <Empty icon="flag" text="Không có khiếu nại nào" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[680px]">
              <thead className="text-neutral-900 font-bold border-b border-neutral-100 text-[13px]">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Lý do</th>
                  <th className="px-6 py-4">Mô tả</th>
                  <th className="px-6 py-4">Người gửi</th>
                  <th className="px-6 py-4">Ngày</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-[#166534] whitespace-nowrap">#FR-{r.id.slice(-5).toUpperCase()}</td>
                    <td className="px-6 py-4 font-medium text-neutral-800">{r.reason}</td>
                    <td className="px-6 py-4 text-neutral-500 max-w-[220px] truncate">{r.description || '—'}</td>
                    <td className="px-6 py-4 text-neutral-700 whitespace-nowrap">{r.reporter.fullName}</td>
                    <td className="px-6 py-4 text-neutral-700 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${r.status === 'pending' ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#bbf7d0] text-emerald-900'}`}>
                        {r.status === 'pending' ? 'Đang chờ' : r.status === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {r.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => act(r.id, 'dismissed')} disabled={resolve.isPending} title="Bỏ qua" className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:bg-neutral-100"><span className="material-symbols-outlined text-[18px]">close</span></button>
                          <button onClick={() => act(r.id, 'resolved')} disabled={resolve.isPending} title="Đã xử lý" className="w-8 h-8 rounded-full bg-[#166534] text-white flex items-center justify-center hover:bg-[#14532d]"><span className="material-symbols-outlined text-[18px]">check</span></button>
                        </div>
                      ) : (
                        <span className="material-symbols-outlined text-emerald-500">task_alt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// MONITOR & USERS & SETTINGS
// ----------------------------------------------------------------------
function MonitorTab() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Giám sát hệ thống</h2>
      <Empty icon="monitoring" text="Module giám sát đang được phát triển." />
    </div>
  );
}

const USER_ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  admin: { label: 'Quản trị', cls: 'badge-violet' },
  provider: { label: 'Nhà cung cấp', cls: 'badge-sky' },
  receiver: { label: 'Người nhận', cls: 'badge-honey' },
  volunteer: { label: 'Tình nguyện viên', cls: 'badge-emerald' },
};
const USER_STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: 'Đang hoạt động', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  pending_verification: { label: 'Chờ xét duyệt', dot: 'bg-honey-500', text: 'text-honey-700' },
  suspended: { label: 'Bị hạn chế', dot: 'bg-honey-500', text: 'text-honey-700' },
  banned: { label: 'Bị đình chỉ', dot: 'bg-rose-500', text: 'text-rose-600' },
};
const USER_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xét duyệt' },
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'suspended', label: 'Bị đình chỉ' },
];

function UsersTab() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const { data, isLoading } = useAdminUsers(undefined, q || undefined);
  const { data: ov } = useAdminOverview();
  const setStatus = useSetUserStatus();

  async function act(id: string, status: 'active' | 'banned') {
    try {
      await setStatus.mutateAsync({ id, status });
      toast.success(status === 'banned' ? 'Đã khoá tài khoản' : 'Đã cập nhật tài khoản');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thất bại';
      toast.error(msg);
    }
  }

  const filtered = (data ?? []).filter((u) => {
    if (filter === 'pending') return u.status === 'pending_verification';
    if (filter === 'active') return u.status === 'active';
    if (filter === 'suspended') return u.status === 'banned' || u.status === 'suspended';
    return true;
  });
  const paged = usePaged(filtered, 8, `${q}-${filter}`);

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative pb-16">
      {/* Header + filter tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý Tài khoản</h2>
          <p className="text-sm text-neutral-500 mt-1">Theo dõi và quản lý cộng đồng Food Rescue của bạn.</p>
        </div>
        <div className="flex gap-1 bg-white border border-neutral-200 rounded-full p-1 w-fit shadow-sm">
          {USER_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                filter === f.key ? 'bg-[#166534] text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#166534] text-white flex items-center justify-center"><span className="material-symbols-outlined">group</span></div>
          <div><p className="text-xs font-semibold text-neutral-600">Tổng thành viên</p><p className="text-2xl font-extrabold text-neutral-900">{(ov?.users ?? 0).toLocaleString('vi-VN')}</p></div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#166534] text-white flex items-center justify-center"><span className="material-symbols-outlined">person_add</span></div>
          <div><p className="text-xs font-semibold text-neutral-600">Người dùng mới (7 ngày)</p><p className="text-2xl font-extrabold text-neutral-900">+{ov?.newUsers ?? 0}</p></div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-neutral-100 text-neutral-500 flex items-center justify-center"><span className="material-symbols-outlined">pending_actions</span></div>
          <div><p className="text-xs font-semibold text-neutral-600">Đang chờ duyệt</p><p className="text-2xl font-extrabold text-neutral-900">{ov?.pendingVerifications ?? 0}</p></div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[20px]">search</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người dùng..."
          className="w-full bg-white border border-neutral-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none shadow-sm" />
      </div>

      {/* Table */}
      {isLoading ? <Skeleton /> : filtered.length === 0 ? (
        <Empty icon="group" text="Không tìm thấy tài khoản phù hợp" />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead className="text-neutral-500 font-semibold text-[13px] bg-neutral-50/60">
                <tr>
                  <th className="px-6 py-4 w-[34%]">Tên</th>
                  <th className="px-6 py-4">Vai trò</th>
                  <th className="px-6 py-4">Trust Score</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {paged.slice.map((u) => (
                  <UserRow key={u.id} u={u} onAct={act} onDetail={() => setDetailUser(u)} pending={setStatus.isPending} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}

      {/* Floating add */}
      <button
        onClick={() => setShowCreate(true)}
        title="Thêm tài khoản"
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-[#166534] hover:bg-[#14532d] text-white shadow-lg flex items-center justify-center transition-colors z-20"
      >
        <span className="material-symbols-outlined">person_add</span>
      </button>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {detailUser && <UserDetailModal u={detailUser} onClose={() => setDetailUser(null)} onAct={act} />}
    </div>
  );
}

function trustToFive(score: number): number {
  return Math.round((score / 20) * 10) / 10;
}

function UserRow({ u, onAct, onDetail, pending }: { u: AdminUser; onAct: (id: string, s: 'active' | 'banned') => void; onDetail: () => void; pending: boolean }) {
  const [menu, setMenu] = useState(false);
  const role = u.isCharityOrg ? { label: 'Tổ chức từ thiện', cls: 'badge-violet' } : (USER_ROLE_BADGE[u.role] ?? { label: u.role, cls: 'badge-neutral' });
  const st = USER_STATUS_META[u.status] ?? { label: u.status, dot: 'bg-neutral-400', text: 'text-neutral-500' };
  const five = trustToFive(u.trustScore);
  const goodScore = five >= 3;

  return (
    <tr className="hover:bg-neutral-50/50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {u.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.avatarUrl} alt={u.fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">{u.fullName.charAt(0).toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-neutral-900 truncate">{u.fullName}</p>
            <p className="text-xs text-neutral-500 truncate">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4"><span className={`badge ${role.cls}`}>{role.label}</span></td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1 font-bold ${goodScore ? 'text-neutral-800' : 'text-neutral-400'}`}>
          <span className="material-symbols-outlined text-[16px] text-amber-400" style={{ fontVariationSettings: goodScore ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          {five.toFixed(1)}/5.0
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${st.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          {u.role !== 'admin' && u.status === 'pending_verification' && (
            <button onClick={() => onAct(u.id, 'active')} disabled={pending} className="px-4 py-1.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full text-xs font-bold transition-colors disabled:opacity-50">Xét duyệt</button>
          )}
          {u.role !== 'admin' && u.status === 'banned' && (
            <button onClick={() => onAct(u.id, 'active')} disabled={pending} className="px-4 py-1.5 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 rounded-full text-xs font-bold transition-colors disabled:opacity-50">Khôi phục</button>
          )}
          {u.role !== 'admin' && (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"><span className="material-symbols-outlined text-[20px]">more_vert</span></button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-neutral-200 rounded-xl shadow-xl z-40 py-1 overflow-hidden">
                    <button onClick={() => { onDetail(); setMenu(false); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">visibility</span>Xem chi tiết</button>
                    {u.status === 'banned' ? (
                      <button onClick={() => { onAct(u.id, 'active'); setMenu(false); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">lock_open</span>Mở khoá</button>
                    ) : (
                      <button onClick={() => { onAct(u.id, 'banned'); setMenu(false); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">block</span>Khoá tài khoản</button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function UserDetailModal({ u, onClose, onAct }: { u: AdminUser; onClose: () => void; onAct: (id: string, s: 'active' | 'banned') => void }) {
  const role = u.isCharityOrg ? { label: 'Tổ chức từ thiện', cls: 'badge-violet' } : (USER_ROLE_BADGE[u.role] ?? { label: u.role, cls: 'badge-neutral' });
  const st = USER_STATUS_META[u.status] ?? { label: u.status, dot: 'bg-neutral-400', text: 'text-neutral-500' };
  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#166534] px-6 py-6 text-white flex flex-col items-center text-center relative">
          <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-white/15 rounded-full"><span className="material-symbols-outlined">close</span></button>
          <div className="w-20 h-20 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center font-extrabold text-3xl overflow-hidden">
            {u.avatarUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={u.avatarUrl} alt={u.fullName} className="w-full h-full object-cover" />) : u.fullName.charAt(0).toUpperCase()}
          </div>
          <p className="font-extrabold text-xl mt-3">{u.fullName}</p>
          <span className={`badge ${role.cls} mt-1`}>{role.label}</span>
        </div>
        <div className="p-6 space-y-3">
          <AccountRow icon="mail" label="Email" value={u.email} />
          <AccountRow icon="verified_user" label="Điểm uy tín" value={`${u.trustScore}/100 (${trustToFive(u.trustScore).toFixed(1)}/5.0)`} />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[20px] text-neutral-500">toggle_on</span></div>
            <div><p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wide">Trạng thái</p><span className={`inline-flex items-center gap-1.5 text-sm font-bold ${st.text}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span></div>
          </div>
          <AccountRow icon="schedule" label="Ngày tạo" value={new Date(u.createdAt).toLocaleDateString('vi-VN')} />
          {u.role !== 'admin' && (
            <div className="flex gap-2 pt-2">
              {u.status === 'banned' ? (
                <button onClick={() => { onAct(u.id, 'active'); onClose(); }} className="flex-1 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white font-bold text-sm rounded-xl transition-colors">Khôi phục tài khoản</button>
              ) : u.status === 'pending_verification' ? (
                <button onClick={() => { onAct(u.id, 'active'); onClose(); }} className="flex-1 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white font-bold text-sm rounded-xl transition-colors">Xét duyệt</button>
              ) : (
                <button onClick={() => { onAct(u.id, 'banned'); onClose(); }} className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm rounded-xl transition-colors">Khoá tài khoản</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const [f, setF] = useState<CreateUserInput>({ email: '', password: '', fullName: '', role: 'receiver' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.email.includes('@')) { toast.error('Email không hợp lệ'); return; }
    if (f.password.length < 8) { toast.error('Mật khẩu tối thiểu 8 ký tự'); return; }
    if (f.fullName.trim().length < 2) { toast.error('Nhập họ tên'); return; }
    try {
      await create.mutateAsync(f);
      toast.success('Đã tạo tài khoản');
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Tạo thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md my-8 shadow-2xl overflow-hidden">
        <div className="bg-[#166534] px-6 py-5 text-white flex items-center gap-3">
          <span className="material-symbols-outlined">person_add</span>
          <h3 className="font-extrabold text-lg">Thêm tài khoản</h3>
        </div>
        <div className="p-6 space-y-4">
          <input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="Họ tên *" className="input-base" required />
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email *" className="input-base" required />
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Mật khẩu (≥ 8 ký tự) *" className="input-base" required minLength={8} />
          <input value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Số điện thoại" className="input-base" />
          <div>
            <label className="text-xs font-bold text-neutral-500">Vai trò *</label>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as CreateUserInput['role'] })} className="input-base mt-1">
              <option value="receiver">Người nhận</option>
              <option value="provider">Nhà cung cấp</option>
              <option value="volunteer">Tình nguyện viên</option>
            </select>
          </div>
          {f.role === 'provider' && (
            <input value={f.businessName ?? ''} onChange={(e) => setF({ ...f, businessName: e.target.value })} placeholder="Tên cửa hàng" className="input-base" />
          )}
          {f.role === 'volunteer' && (
            <div>
              <label className="text-xs font-bold text-neutral-500">Chuyên môn</label>
              <select value={f.volunteerRole ?? ''} onChange={(e) => setF({ ...f, volunteerRole: (e.target.value || undefined) as CreateUserInput['volunteerRole'] })} className="input-base mt-1">
                <option value="">— Không —</option>
                <option value="chef">Đầu bếp</option>
                <option value="waiter">Phục vụ</option>
                <option value="shipper">Giao hàng</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors">Huỷ</button>
            <button type="submit" disabled={create.isPending} className="flex-1 py-3 bg-[#166534] hover:bg-[#14532d] text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-colors">{create.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SettingsTab() {
  const { data, isLoading } = useAdminConfigs();

  if (isLoading) return <div className="max-w-3xl mx-auto"><Skeleton /></div>;

  // Nhóm cấu hình theo group
  const groups = (data ?? []).reduce<Record<string, SystemConfigItem[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Cài đặt hệ thống</h2>
        <p className="text-sm text-neutral-500 mt-1">Chỉnh quy tắc nghiệp vụ — có hiệu lực ngay, không cần deploy lại.</p>
      </div>

      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-[#f9faf9] border-b border-neutral-150">
            <h3 className="font-bold text-neutral-900">{group}</h3>
          </div>
          <div className="divide-y divide-neutral-100">
            {items.map((c) => <ConfigRow key={c.key} cfg={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfigRow({ cfg }: { cfg: SystemConfigItem }) {
  const setConfig = useSetConfig();
  const [val, setVal] = useState(String(cfg.value));
  const dirty = Number(val) !== cfg.value;

  async function save() {
    const n = Number(val);
    if (Number.isNaN(n) || n < cfg.min || n > cfg.max) {
      toast.error(`${cfg.label} phải trong khoảng ${cfg.min}–${cfg.max} ${cfg.unit}.`);
      return;
    }
    try {
      await setConfig.mutateAsync({ key: cfg.key, value: n });
      toast.success(`Đã cập nhật "${cfg.label}"`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Cập nhật thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-bold text-neutral-900 text-sm">{cfg.label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{cfg.description}</p>
        <p className="text-[11px] text-neutral-400 mt-1">Khoảng cho phép: {cfg.min}–{cfg.max} {cfg.unit} · mặc định {cfg.default}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <input
            type="number"
            value={val}
            min={cfg.min}
            max={cfg.max}
            onChange={(e) => setVal(e.target.value)}
            className="w-24 bg-white border border-neutral-200 rounded-xl py-2.5 pl-3 pr-10 text-sm font-bold text-neutral-900 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-medium pointer-events-none">{cfg.unit}</span>
        </div>
        <button
          onClick={save}
          disabled={!dirty || setConfig.isPending}
          className="px-4 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SHARED COMPONENTS
// ----------------------------------------------------------------------
// Phân trang client-side dùng chung cho mọi danh sách admin.
// resetKey: đổi (vd khi tìm kiếm / lọc) thì về trang 1.
function usePaged<T>(items: T[], perPage: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const cur = Math.min(page, totalPages);
  const slice = items.slice((cur - 1) * perPage, cur * perPage);
  return { page: cur, setPage, totalPages, total: items.length, perPage, slice };
}

function Pagination({ page, totalPages, total, perPage, onChange }: {
  page: number; totalPages: number; total: number; perPage: number; onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="p-4 flex items-center justify-between text-xs text-neutral-500 font-medium border-t border-neutral-100">
      <span>Hiển thị {from}–{to} trên {total}</span>
      <div className="flex gap-1 items-center">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 disabled:opacity-30 transition-colors"><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
        {start > 1 && <span className="w-6 text-center">…</span>}
        {pages.map((p) => (
          <button key={p} onClick={() => onChange(p)} className={`w-8 h-8 rounded-full text-sm font-bold transition-colors ${p === page ? 'bg-[#166534] text-white' : 'border border-neutral-200 hover:bg-neutral-50'}`}>{p}</button>
        ))}
        {end < totalPages && <span className="w-6 text-center">…</span>}
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 disabled:opacity-30 transition-colors"><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-neutral-100 animate-pulse rounded-3xl" />)}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-neutral-200 shadow-sm">
      <div className="w-24 h-24 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
        <span className="material-symbols-outlined text-emerald-600 text-[48px]">{icon}</span>
      </div>
      <p className="font-bold text-neutral-600 mt-6">{text}</p>
    </div>
  );
}
