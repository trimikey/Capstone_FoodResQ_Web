'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useAdminStats,
  useVerifications,
  useReviewVerification,
  useAdminReports,
  useResolveReport,
  useAdminUsers,
  useSetUserStatus,
} from '@/hooks/useAdmin';

type Tab = 'dashboard' | 'verify' | 'reports' | 'users';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Tổng quan', icon: 'dashboard' },
  { key: 'verify', label: 'Duyệt hồ sơ', icon: 'verified_user' },
  { key: 'reports', label: 'Báo cáo', icon: 'flag' },
  { key: 'users', label: 'Người dùng', icon: 'group' },
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-10 space-y-6">
        <h1 className="font-extrabold text-3xl text-neutral-900">Bảng điều khiển Quản trị</h1>

        <div className="flex gap-1 bg-white border border-neutral-200 rounded-2xl p-1 w-fit overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${
                tab === t.key ? 'bg-emerald-700 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'verify' && <VerifyTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const { data, isLoading } = useAdminStats();
  if (isLoading || !data) return <Skeleton />;
  const cards = [
    { label: 'Người dùng', value: data.users, icon: 'group', cls: 'text-blue-700 bg-blue-50' },
    { label: 'Cửa hàng', value: data.providers, icon: 'storefront', cls: 'text-emerald-700 bg-emerald-50' },
    { label: 'Tình nguyện viên', value: data.volunteers, icon: 'volunteer_activism', cls: 'text-amber-700 bg-amber-50' },
    { label: 'Tin đang mở', value: data.listingsActive, icon: 'restaurant', cls: 'text-purple-700 bg-purple-50' },
    { label: 'Lượt đặt', value: data.reservations, icon: 'receipt_long', cls: 'text-cyan-700 bg-cyan-50' },
    { label: 'Hồ sơ chờ duyệt', value: data.pendingVerifications, icon: 'verified_user', cls: 'text-rose-700 bg-rose-50' },
    { label: 'Báo cáo chờ xử lý', value: data.pendingReports, icon: 'flag', cls: 'text-rose-700 bg-rose-50' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.cls}`}>
            <span className="material-symbols-outlined text-[22px]">{c.icon}</span>
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 mt-3">{c.value}</p>
          <p className="text-xs text-neutral-500 font-bold mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

function VerifyTab() {
  const { data, isLoading } = useVerifications();
  const review = useReviewVerification();

  async function act(type: string, id: string, decision: 'approved' | 'rejected') {
    try {
      await review.mutateAsync({ type, id, decision });
      toast.success(decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối');
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  if (isLoading) return <Skeleton />;
  if (!data || data.length === 0) return <Empty icon="verified_user" text="Không có hồ sơ chờ duyệt" />;

  return (
    <div className="space-y-3">
      {data.map((v) => (
        <div key={`${v.type}-${v.profileId}`} className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-neutral-100 text-neutral-600 uppercase">{v.type === 'provider' ? 'Cửa hàng' : 'TNV'}</span>
              <h3 className="font-bold text-neutral-900 truncate">{v.fullName}</h3>
            </div>
            <p className="text-xs text-neutral-500 mt-1 truncate">{v.email}{v.phone ? ` · ${v.phone}` : ''}</p>
            <p className="text-xs text-neutral-600 mt-1 truncate">{v.detail}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => act(v.type, v.profileId, 'rejected')} disabled={review.isPending}
              className="px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold disabled:opacity-50">Từ chối</button>
            <button onClick={() => act(v.type, v.profileId, 'approved')} disabled={review.isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50">Duyệt</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsTab() {
  const { data, isLoading } = useAdminReports();
  const resolve = useResolveReport();

  async function act(id: string, status: 'resolved' | 'dismissed') {
    try {
      await resolve.mutateAsync({ id, status });
      toast.success(status === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua');
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  if (isLoading) return <Skeleton />;
  if (!data || data.length === 0) return <Empty icon="flag" text="Không có báo cáo" />;

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <div key={r.id} className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 uppercase">{r.reason}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${r.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-500'}`}>{r.status}</span>
            </div>
            <span className="text-[11px] text-neutral-400">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
          </div>
          <p className="text-sm text-neutral-700 mt-2">{r.description || '(không có mô tả)'}</p>
          <p className="text-xs text-neutral-400 mt-1">Bởi: {r.reporter.fullName} · {r.targetType}</p>
          {r.status === 'pending' && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => act(r.id, 'dismissed')} disabled={resolve.isPending}
                className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-xl text-xs font-bold disabled:opacity-50">Bỏ qua</button>
              <button onClick={() => act(r.id, 'resolved')} disabled={resolve.isPending}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50">Đã xử lý</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useAdminUsers(undefined, q || undefined);
  const setStatus = useSetUserStatus();

  async function act(id: string, status: 'active' | 'banned') {
    try {
      await setStatus.mutateAsync({ id, status });
      toast.success(status === 'banned' ? 'Đã khoá tài khoản' : 'Đã mở khoá');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thất bại';
      toast.error(msg);
    }
  }

  const STATUS_CLS: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    suspended: 'bg-amber-50 text-amber-700',
    banned: 'bg-rose-50 text-rose-700',
    pending_verification: 'bg-neutral-100 text-neutral-500',
  };

  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo email / tên..."
        className="w-full max-w-sm border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20" />
      {isLoading ? <Skeleton /> : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden divide-y divide-neutral-100">
          {(data ?? []).map((u) => (
            <div key={u.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-neutral-900 text-sm truncate">{u.fullName} <span className="text-[10px] font-black text-neutral-400 uppercase ml-1">{u.role}</span></p>
                <p className="text-xs text-neutral-500 truncate">{u.email} · uy tín {u.trustScore}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CLS[u.status] ?? 'bg-neutral-100 text-neutral-500'}`}>{u.status}</span>
                {u.role !== 'admin' && (
                  u.status === 'banned' ? (
                    <button onClick={() => act(u.id, 'active')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">Mở khoá</button>
                  ) : (
                    <button onClick={() => act(u.id, 'banned')} className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold">Khoá</button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-white border border-neutral-200 animate-pulse" />)}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-neutral-200">
      <span className="material-symbols-outlined text-neutral-300 text-[56px]">{icon}</span>
      <p className="font-bold text-neutral-600 mt-3">{text}</p>
    </div>
  );
}
