'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { useMe, useUpdateMe, useTrustHistory } from '@/hooks/useProfile';
import { useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { UserRole } from '@foodresq/types';
import type { UserRole as UserRoleType } from '@foodresq/types';

// Ảnh lưu ở /uploads trên API server → ghép với origin (bỏ đuôi /api/v1)
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
function imgUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
}

const VOL_ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

const ROLE_META: Record<UserRoleType, { label: string; icon: string; color: string }> = {
  [UserRole.RECEIVER]: { label: 'Người nhận', icon: 'person_pin', color: 'emerald' },
  [UserRole.PROVIDER]: { label: 'Nhà cung cấp', icon: 'storefront', color: 'amber' },
  [UserRole.VOLUNTEER]: { label: 'Tình nguyện viên', icon: 'volunteer_activism', color: 'violet' },
  [UserRole.ADMIN]: { label: 'Quản trị viên', icon: 'admin_panel_settings', color: 'rose' },
};

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; soft: string }> = {
  emerald: { bg: 'bg-emerald-600', text: 'text-emerald-700', border: 'border-emerald-200', soft: 'bg-emerald-50' },
  amber:   { bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-200', soft: 'bg-amber-50' },
  violet:  { bg: 'bg-violet-600', text: 'text-violet-700', border: 'border-violet-200', soft: 'bg-violet-50' },
  rose:    { bg: 'bg-rose-600', text: 'text-rose-700', border: 'border-rose-200', soft: 'bg-rose-50' },
};

function trustLabel(score: number): string {
  if (score >= 80) return 'Uy tín cao';
  if (score >= 60) return 'Uy tín tốt';
  if (score > 30) return 'Bị hạn chế';
  return 'Bị khóa';
}

function trustBadgeColor(score: number): string {
  if (score >= 80) return 'bg-emerald-600 text-white';
  if (score >= 60) return 'bg-emerald-700 text-white';
  if (score > 30) return 'bg-amber-500 text-white';
  return 'bg-rose-600 text-white';
}

const TRUST_REASON_LABEL: Record<string, string> = {
  late_cancellation: 'Hủy đơn gần giờ hẹn',
  no_show: 'Không nhận hàng đúng hạn',
  bad_rating_received: 'Nhận đánh giá kém từ nhà cung cấp',
  food_safety_violation: 'Vi phạm an toàn thực phẩm',
  hoarding_detected: 'Gian lận đặt nhiều đơn một lúc',
  manual_penalty: 'Bị phạt thủ công từ quản trị viên',
  manual_bonus: 'Thưởng thủ công từ quản trị viên',
  successful_rescue: 'Hoàn thành nhận thực phẩm thành công',
  high_rating_received: 'Nhận đánh giá cao từ nhà cung cấp',
  delivery_completed: 'Hoàn thành giao hàng thành công',
  campaign_completed: 'Tham gia chiến dịch từ thiện',
};

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const router = useRouter();
  const { data: me, isLoading, isError } = useMe();
  const updateMe = useUpdateMe();

  const isFaceRole = me?.role === UserRole.RECEIVER || me?.role === UserRole.VOLUNTEER;
  const { data: faceEnrollment } = useFaceEnrollment(isFaceRole);
  const faceImage = imgUrl(faceEnrollment?.faceImageUrl);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', avatarUrl: '' });
  const [showTrustHistory, setShowTrustHistory] = useState(false);

  useEffect(() => {
    if (me) {
      setEditForm({ fullName: me.fullName, phone: me.phone ?? '', avatarUrl: me.avatarUrl ?? '' });
    }
  }, [me]);

  const { data: trustHistory, isLoading: trustLoading } = useTrustHistory();

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMe.mutateAsync({
        fullName: editForm.fullName,
        phone: editForm.phone || undefined,
        avatarUrl: editForm.avatarUrl || undefined,
      });
      setIsEditModalOpen(false);
      toast.success('Cập nhật hồ sơ cá nhân thành công!');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Cập nhật thất bại. Vui lòng thử lại.';
      toast.error(msg);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
    toast.success('Đã đăng xuất tài khoản.');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <span className="relative flex h-14 w-14">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-14 w-14 bg-emerald-500 items-center justify-center">
              <span className="material-symbols-outlined text-white text-[28px]">person</span>
            </span>
          </span>
          <p className="text-sm font-bold text-neutral-500">Đang tải hồ sơ...</p>
        </div>
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center">
          <span className="material-symbols-outlined text-rose-400 text-[40px]">wifi_off</span>
        </div>
        <p className="font-bold text-neutral-700">Không tải được hồ sơ từ máy chủ</p>
        <button
          onClick={() => router.refresh()}
          className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm transition-colors"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const roleLabel = me.receiver?.isCharityOrg ? 'Tổ chức từ thiện' : (ROLE_META[me.role]?.label ?? me.role);
  const meta = COLOR_MAP[ROLE_META[me.role as UserRoleType]?.color ?? 'emerald'];
  const meIsCharity = !!me.receiver?.isCharityOrg;

  // Thống kê hiển thị trên trang phải KHỚP với vai trò — lấy trực tiếp từ BE /users/me.
  // BE đã aggregate theo role, FE chỉ việc đọc & gán nhãn tiếng Việt.
  const roleStats: { label: string; value: number | string; icon: string; roleBadge: string }[] =
    me.stats.kind === 'receiver'
      ? [
          { label: 'Đơn nhận thành công', value: me.stats.completedCount ?? 0, icon: 'check_circle', roleBadge: 'Người nhận' },
          { label: 'Kg thực phẩm đã nhận', value: me.stats.kgSaved ?? 0, icon: 'scale', roleBadge: 'Người nhận' },
          { label: 'Nhà cung cấp đã gặp', value: me.stats.providersHelped ?? 0, icon: 'handshake', roleBadge: 'Người nhận' },
        ]
      : me.stats.kind === 'provider'
        ? [
            { label: 'Tin đã đăng', value: me.stats.listingsCount ?? 0, icon: 'inventory_2', roleBadge: 'Nhà cung cấp' },
            { label: 'Đơn đã phát', value: me.stats.completedOrdersCount ?? 0, icon: 'redeem', roleBadge: 'Nhà cung cấp' },
            { label: 'Tổng kg đã cứu', value: me.stats.totalKgRescued ?? 0, icon: 'scale', roleBadge: 'Nhà cung cấp' },
          ]
        : me.stats.kind === 'volunteer'
          ? [
              { label: 'Chuyến đã giao', value: me.stats.deliveriesCompleted ?? 0, icon: 'local_shipping', roleBadge: 'Tình nguyện viên' },
              { label: 'Đơn đang chạy', value: me.stats.deliveriesInProgress ?? 0, icon: 'directions_bike', roleBadge: 'Tình nguyện viên' },
              { label: 'Điểm cống hiến', value: me.volunteer?.dedicationPoints ?? 0, icon: 'diamond', roleBadge: 'Tình nguyện viên' },
            ]
          : [
              { label: 'Ngày tham gia', value: new Date(me.createdAt).toLocaleDateString('vi-VN'), icon: 'event', roleBadge: 'Quản trị' },
              { label: 'Điểm tin cậy', value: me.trustScore, icon: 'stars', roleBadge: 'Quản trị' },
              { label: 'Vai trò', value: 'Quản trị viên', icon: 'admin_panel_settings', roleBadge: 'Quản trị' },
            ];

  // Lối tắt "lịch sử" theo vai trò — mỗi role có trang riêng
  const historyAction =
    me.role === UserRole.RECEIVER
      ? { label: 'Lịch sử nhận hàng', icon: 'history', href: '/history' }
      : me.role === UserRole.PROVIDER
        ? { label: 'Đơn hàng của tôi', icon: 'receipt_long', href: '/provider/orders' }
        : me.role === UserRole.VOLUNTEER
          ? { label: 'Đơn đã giao', icon: 'local_shipping', href: '/deliveries' }
          : { label: 'Trang quản trị', icon: 'admin_panel_settings', href: '/admin' };

  const accountAge = (() => {
    const months = Math.floor((Date.now() - new Date(me.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months < 1) return 'Vừa tham gia';
    if (months < 12) return `${months} tháng`;
    const years = Math.floor(months / 12);
    return `${years} năm ${months % 12 > 0 ? (months % 12) + ' tháng' : ''}`;
  })();

  // Achievement badge phụ thuộc vai trò + stats
  const achievementBadge = (() => {
    if (me.stats.kind === 'receiver') {
      if ((me.stats.completedCount ?? 0) >= 20) return { label: 'Siêu thực phẩm', icon: 'workspace_premium', color: 'bg-amber-400 text-amber-900' };
      if ((me.stats.completedCount ?? 0) >= 5) return { label: 'Thành viên tích cực', icon: 'verified', color: 'bg-emerald-500 text-white' };
    }
    if (me.stats.kind === 'provider') {
      if ((me.stats.totalKgRescued ?? 0) >= 100) return { label: 'Top Contributor', icon: 'emoji_events', color: 'bg-amber-400 text-amber-900' };
      if ((me.stats.listingsCount ?? 0) >= 10) return { label: 'Nhà hảo tâm', icon: 'favorite', color: 'bg-rose-400 text-rose-900' };
    }
    if (me.stats.kind === 'volunteer') {
      if ((me.stats.deliveriesCompleted ?? 0) >= 50) return { label: 'Shipper huyền thoại', icon: 'local_shipping', color: 'bg-blue-500 text-white' };
      if ((me.stats.deliveriesCompleted ?? 0) >= 10) return { label: 'Shipper tích cực', icon: 'directions_run', color: 'bg-teal-500 text-white' };
    }
    return null;
  })();

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      {/* ── TOP HERO ─────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-emerald-400/10" />
        <div className="absolute bottom-0 -left-16 w-56 h-56 rounded-full bg-white/5" />

        <div className="relative max-w-5xl mx-auto px-6 md:px-12 pt-10 pb-14">
          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white/30 overflow-hidden bg-white/10 shadow-2xl shadow-black/20">
                {me.avatarUrl ? (
                  <img src={me.avatarUrl} alt={me.fullName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-emerald-600/40">
                    <span className="text-5xl md:text-6xl font-extrabold text-white">
                      {me.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {/* online dot */}
              <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-400 border-[3px] border-emerald-800 rounded-full" />
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0 pt-1">
              {/* Top row: achievement badge + account age */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {achievementBadge && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${achievementBadge.color}`}>
                    <span className="material-symbols-outlined text-[13px]">{achievementBadge.icon}</span>
                    {achievementBadge.label}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 border border-white/20">
                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                  {accountAge}
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{me.fullName}</h1>

              {/* Role badges */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/15 border border-white/20">
                  <span className="material-symbols-outlined text-[14px]">{ROLE_META[me.role as UserRoleType]?.icon}</span>
                  {roleLabel}
                </span>
                {me.volunteer && me.volunteer.specializations.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 border border-white/20">
                    <span className="material-symbols-outlined text-[13px]">verified</span>
                    {VOL_ROLE_LABEL[me.volunteer.specializations[0].specialization] ?? 'Tình nguyện'}
                  </span>
                )}
                {me.provider?.isVerified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400/20 border border-amber-400/30 text-amber-200">
                    <span className="material-symbols-outlined text-[13px]">verified</span>
                    Đã xác minh
                  </span>
                )}
              </div>

              {/* Volunteer info */}
              {me.volunteer && (
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-emerald-100/90 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-amber-300">military_tech</span>
                    Hạng {me.volunteer.rank}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-amber-300">diamond</span>
                    {me.volunteer.dedicationPoints} điểm cống hiến
                  </span>
                </div>
              )}

              {/* Trust score */}
              <div className="flex items-center gap-2 mt-3">
                <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${trustBadgeColor(me.trustScore)}`}>
                  {trustLabel(me.trustScore)}
                </div>
                <span className="text-xs font-bold text-emerald-200">{me.trustScore} điểm tin cậy</span>
              </div>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex flex-col gap-2">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-2xl font-bold text-sm shadow-lg shadow-black/10 transition-all hover:scale-[1.03] active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Chỉnh sửa
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-sm border border-white/20 transition-all hover:scale-[1.03] active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────────── */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12 mt-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Trust + contact */}
          <div className="lg:col-span-4 space-y-6">
            {/* Trust Score */}
            <div className="bg-white rounded-3xl border-l-4 border-l-emerald-600 border border-neutral-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-neutral-800 font-bold text-sm">
                  <span className="material-symbols-outlined text-[20px] text-emerald-600">stars</span>
                  <span>Điểm Tin Cậy</span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${trustBadgeColor(me.trustScore)}`}>
                  {trustLabel(me.trustScore)}
                </span>
              </div>

              {/* Circular ring + score */}
              <div className="flex items-center gap-5 mt-4">
                <div className="relative shrink-0">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      className={`${me.trustScore >= 80 ? 'stroke-emerald-500' : me.trustScore >= 60 ? 'stroke-amber-400' : 'stroke-rose-500'} transition-all duration-700`}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 42}
                      strokeDashoffset={2 * Math.PI * 42 - (me.trustScore / 100) * 2 * Math.PI * 42}
                      transform="rotate(-90 50 50)"
                    />
                    <text x="50" y="56" textAnchor="middle" className="fill-neutral-900 font-extrabold text-2xl">
                      {me.trustScore}
                    </text>
                    <text x="50" y="68" textAnchor="middle" className="fill-neutral-400 font-bold text-[10px]">
                      / 100
                    </text>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    {me.stats.kind === 'receiver' ? (
                      <>Đã cứu <span className="text-emerald-700 font-bold">{me.stats.kgSaved ?? 0}kg</span> thực phẩm dư thừa</>
                    ) : me.stats.kind === 'provider' ? (
                      <>Đã đóng góp <span className="text-emerald-700 font-bold">{me.stats.totalKgRescued ?? 0}kg</span> cho cộng đồng</>
                    ) : me.stats.kind === 'volunteer' ? (
                      <>Hoàn tất <span className="text-emerald-700 font-bold">{me.stats.deliveriesCompleted ?? 0}</span> chuyến giao hàng</>
                    ) : (
                      <>Tài khoản quản trị hệ thống</>
                    )}
                  </p>
                  {me.trustScore <= 60 && me.trustScore > 30 && (
                    <p className="mt-1 text-xs text-amber-700 font-semibold">
                      Bạn đang bị hạn chế — nhận tối đa 1 đơn/ngày. Tích cực nhận hàng đúng hạn để khôi phục.
                    </p>
                  )}
                  {me.trustScore <= 30 && (
                    <p className="mt-1 text-xs text-rose-700 font-semibold">
                      Tài khoản đang bị khóa. Liên hệ quản trị viên để được hỗ trợ.
                    </p>
                  )}
                </div>
              </div>

              {/* Trust history toggle */}
              <button
                onClick={() => setShowTrustHistory((v) => !v)}
                className="mt-4 w-full flex items-center justify-between py-2.5 px-3 rounded-xl border border-neutral-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all text-xs font-bold text-neutral-600 hover:text-emerald-700"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">history</span>
                  Lịch sử điểm tin cậy
                </span>
                <span className="material-symbols-outlined text-[16px] transition-transform duration-200" style={{ transform: showTrustHistory ? 'rotate(180deg)' : 'none' }}>
                  expand_more
                </span>
              </button>

              {showTrustHistory && (
                <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {trustLoading && (
                    <div className="flex items-center gap-2 py-3 text-neutral-400">
                      <span className="animate-spin border-2 border-neutral-200 border-t-emerald-600 rounded-full w-4 h-4" />
                      <span className="text-xs font-semibold">Đang tải...</span>
                    </div>
                  )}
                  {trustHistory?.items.map((item) => {
                    const reasonLabel = TRUST_REASON_LABEL[item.reason] ?? item.reason ?? item.referenceType ?? 'Điều chỉnh điểm';
                    const isPositive = item.delta > 0;
                    return (
                      <div key={item.id} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isPositive ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold ${isPositive ? 'text-emerald-800' : 'text-rose-800'}`}>
                            {reasonLabel}
                          </p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">
                            {new Date(item.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className={`text-xs font-extrabold ml-2 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPositive ? '+' : ''}{item.delta}
                        </span>
                      </div>
                    );
                  })}
                  {trustHistory?.recommendation && (
                    <div className="py-2.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-xs text-emerald-800 font-semibold leading-relaxed">
                        <span className="material-symbols-outlined text-[14px] align-middle mr-1">lightbulb</span>
                        {trustHistory.recommendation}
                      </p>
                    </div>
                  )}
                  {trustHistory?.items.length === 0 && !trustLoading && (
                    <p className="text-xs text-neutral-400 text-center py-3">Chưa có lịch sử điều chỉnh điểm.</p>
                  )}
                </div>
              )}
            </div>

            {/* Contact */}
            <div className="bg-white rounded-3xl border-l-4 border-l-teal-500 border border-neutral-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="font-bold text-xs text-neutral-400 uppercase tracking-wider mb-4">Thông tin liên hệ</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-teal-600 text-[20px]">mail</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Email</p>
                    <p className="text-sm font-bold text-neutral-800 truncate">{me.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-teal-600 text-[20px]">call</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Số điện thoại</p>
                    <p className="text-sm font-bold text-neutral-800">{me.phone ?? 'Chưa cập nhật'}</p>
                  </div>
                </div>
                {me.provider && (
                  <>
                    {me.provider.businessType && (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-amber-600 text-[20px]">store</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Loại hình</p>
                          <p className="text-sm font-bold text-neutral-800 capitalize">{me.provider.businessType}</p>
                        </div>
                      </div>
                    )}
                    {me.provider.avgRating != null && (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-amber-500 text-[20px]">star</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Đánh giá trung bình</p>
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-neutral-800">{Number(me.provider.avgRating).toFixed(1)}</span>
                            <span className="flex">
                              {[1,2,3,4,5].map((star) => (
                                <span key={star} className={`material-symbols-outlined text-[14px] ${star <= Math.round(Number(me.provider?.avgRating ?? 0)) ? 'text-amber-400' : 'text-neutral-200'}`}>
                                  star
                                </span>
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-emerald-600 text-[20px]">place</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Địa chỉ cửa hàng</p>
                        <p className="text-sm font-bold text-neutral-800 leading-relaxed">{me.provider?.address?.trim() || 'Chưa cập nhật địa chỉ'}</p>
                      </div>
                    </div>
                    {me.provider.isVerified && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                          <span className="material-symbols-outlined text-[13px]">verified</span>
                          Đã xác minh doanh nghiệp
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* eKYC status */}
            {isFaceRole && (
              <div className="bg-white rounded-3xl border-l-4 border-l-emerald-600 border border-neutral-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-bold text-xs text-neutral-400 uppercase tracking-wider mb-3">Xác minh danh tính</h3>
                {faceImage ? (
                  <div className="flex items-center gap-3 border border-emerald-100 rounded-2xl p-3 bg-emerald-50/50">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden border-2 border-emerald-200 bg-emerald-50 shrink-0">
                      <img src={faceImage} alt="Khuôn mặt đã đăng ký" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-emerald-700 font-bold text-sm">
                        <span className="material-symbols-outlined text-[18px]">verified_user</span>
                        <span>Đã xác minh</span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">Dùng để đối chiếu khi nhận hàng.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border border-amber-200 bg-amber-50 rounded-2xl p-3">
                    <span className="material-symbols-outlined text-amber-600 text-[24px]">no_accounts</span>
                    <p className="text-xs text-amber-800 font-semibold leading-relaxed">Chưa đăng ký khuôn mặt. Bạn sẽ được yêu cầu khi nhận hàng.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Activity + menus */}
          <div className="lg:col-span-8 space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {roleStats.map((s, i) => {
                const ROLE_ACCENTS = [
                  { ring: 'stroke-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', labelColor: 'text-emerald-600' },
                  { ring: 'stroke-teal-500', badge: 'bg-teal-50 text-teal-700 border-teal-200', labelColor: 'text-teal-600' },
                  { ring: 'stroke-cyan-500', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', labelColor: 'text-cyan-600' },
                ];
                const ac = ROLE_ACCENTS[i] ?? ROLE_ACCENTS[0];
                const ROLE_MAX: Record<string, number[]> = {
                  receiver: [50, 200, 30],
                  provider: [50, 100, 500],
                  volunteer: [100, 20, 1000],
                  admin: [100, 100, 100],
                };
                const maxVal = typeof s.value === 'number'
                  ? (ROLE_MAX[me.stats.kind]?.[i] ?? 100)
                  : 100;
                const pct = typeof s.value === 'number' ? Math.min((s.value / Math.max(maxVal, 1)) * 100, 100) : 0;
                const radius = 34;
                const circ = 2 * Math.PI * radius;
                const offset = circ - (pct / 100) * circ;
                return (
                  <div
                    key={s.label}
                    className="group bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-default"
                  >
                    <div className="flex items-center justify-between">
                      {/* SVG progress ring */}
                      <svg width="72" height="72" viewBox="0 0 72 72" className="-m-1">
                        <circle cx="36" cy="36" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="6" />
                        <circle
                          cx="36" cy="36" r={radius}
                          fill="none"
                          className={`${ac.ring} transition-all duration-700`}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={circ}
                          strokeDashoffset={offset}
                          transform="rotate(-90 36 36)"
                        />
                        <text x="36" y="40" textAnchor="middle" className="fill-neutral-900 font-extrabold text-lg">
                          {s.value}
                        </text>
                      </svg>
                      <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-lg ${ac.badge}`}>
                        {s.roleBadge}
                      </span>
                    </div>
                    <p className={`text-sm font-bold mt-1 ${ac.labelColor}`}>{s.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Charity info */}
            {meIsCharity && (
              <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
                <h3 className="font-bold text-xs text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-[16px]">volunteer_activism</span>
                  Thông tin tổ chức
                </h3>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-emerald-600 text-[20px]">domain</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Tên tổ chức</p>
                    <p className="text-sm font-bold text-neutral-800">{me.receiver?.organizationName ?? 'Chưa cập nhật'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
              <h3 className="font-bold text-xs text-neutral-400 uppercase tracking-wider mb-4">Tiện ích</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  historyAction,
                  { label: 'Đánh giá', icon: 'rate_review', href: '#' },
                  { label: 'Trợ giúp', icon: 'support_agent', href: '#' },
                  { label: 'Đăng xuất', icon: 'logout', onClick: handleLogout, danger: true },
                ] as { label: string; icon: string; href?: string; onClick?: () => void; danger?: boolean }[]).map((action) => (
                  <button
                    key={action.label}
                    onClick={action.onClick ?? (() => {
                      if (action.href?.startsWith('#')) {
                        toast.info('Tính năng đang phát triển.');
                        return;
                      }
                      if (action.href) router.push(action.href);
                    })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border text-center transition-all group ${action.danger
                        ? 'border-rose-200 hover:border-rose-400 hover:bg-rose-50'
                        : 'border-neutral-100 hover:border-emerald-200 hover:bg-emerald-50/60'
                      }`}
                  >
                    <span className={`material-symbols-outlined text-[28px] text-neutral-400 group-hover:scale-110 transition-all ${action.danger ? 'group-hover:text-rose-500' : 'group-hover:text-emerald-600'}`}>
                      {action.icon}
                    </span>
                    <span className={`text-xs font-bold group-hover:transition-colors ${action.danger ? 'text-neutral-700 group-hover:text-rose-700' : 'text-neutral-700 group-hover:text-emerald-800'}`}>
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── EDIT PROFILE MODAL ─────────────────────────────── */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-150 flex justify-between items-center">
              <h3 className="font-extrabold text-neutral-900 text-lg">Chỉnh sửa hồ sơ</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-400 hover:text-neutral-800 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-xs text-neutral-450 font-bold uppercase">Họ và tên</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-neutral-450 font-bold uppercase">Email (không thể đổi)</label>
                <input
                  type="email"
                  disabled
                  value={me.email}
                  className="w-full border border-neutral-200 bg-neutral-50 text-neutral-500 rounded-xl p-3 text-sm font-semibold cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-neutral-450 font-bold uppercase">Số điện thoại</label>
                <input
                  type="text"
                  value={editForm.phone}
                  placeholder="0901234567"
                  onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-neutral-450 font-bold uppercase">URL ảnh đại diện (tùy chọn)</label>
                <input
                  type="text"
                  value={editForm.avatarUrl}
                  placeholder="https://..."
                  onChange={(e) => setEditForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 text-sm font-semibold"
                />
              </div>

              {/* eKYC status in modal */}
              {isFaceRole && (
                <div className="space-y-1.5 text-left">
                  <label className="text-xs text-neutral-450 font-bold uppercase">Khuôn mặt đã đăng ký</label>
                  {faceImage ? (
                    <div className="flex items-center gap-3 border border-emerald-200 rounded-xl p-3 bg-emerald-50/50">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden border-2 border-emerald-200 bg-emerald-50 shrink-0">
                        <img src={faceImage} alt="Khuôn mặt đã đăng ký" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-emerald-700 font-bold text-sm">
                          <span className="material-symbols-outlined text-[18px]">verified_user</span>
                          <span>Đã xác minh khuôn mặt</span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">Dùng để đối chiếu khi nhận hàng. Không thể tự thay đổi.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 border border-amber-200 bg-amber-50 rounded-xl p-3">
                      <span className="material-symbols-outlined text-amber-600">no_accounts</span>
                      <p className="text-xs text-amber-800 font-semibold leading-relaxed">Chưa đăng ký khuôn mặt.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={updateMe.isPending}
                  className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl transition-colors shadow-sm disabled:opacity-50"
                >
                  {updateMe.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
