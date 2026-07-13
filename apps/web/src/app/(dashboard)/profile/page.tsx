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

  const stats = [
    { label: 'Đơn hoàn tất', value: me.stats.completedCount, icon: 'check_circle', accent: 'emerald' },
    { label: 'Kg thực phẩm cứu', value: me.stats.kgSaved, icon: 'scale', accent: 'teal' },
    { label: 'Cửa hàng đã giúp', value: me.stats.providersHelped, icon: 'favorite', accent: 'rose' },
  ];

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* ── TOP HERO ─────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white overflow-hidden">
        {/* decorative circles */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-emerald-400/10" />
        <div className="absolute bottom-0 -left-16 w-56 h-56 rounded-full bg-white/5" />
        <div className="absolute bottom-6 right-10 w-24 h-24 rounded-full bg-teal-400/10" />
        {/* decorative grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="relative max-w-5xl mx-auto px-6 md:px-12 pt-10 pb-24">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-white/40 overflow-hidden bg-white/10 shadow-2xl shadow-black/20">
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
              <span className="absolute bottom-2 right-2 w-5 h-5 bg-emerald-400 border-[3px] border-emerald-800 rounded-full" />
              {/* ring pulse */}
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" />
            </div>

            {/* Name + meta */}
            <div className="text-center md:text-left space-y-2 flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/30 border border-emerald-400/30 text-[11px] font-bold text-emerald-100 mb-1">
                <span className="material-symbols-outlined text-[12px]">workspace_premium</span>
                Thành viên FoodResQ
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight truncate">{me.fullName}</h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/15 border border-white/20`}>
                  <span className="material-symbols-outlined text-[14px]">{ROLE_META[me.role as UserRoleType]?.icon}</span>
                  {roleLabel}
                </span>
                {me.volunteer && me.volunteer.specializations.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 border border-white/20">
                    <span className="material-symbols-outlined text-[13px]">verified</span>
                    {VOL_ROLE_LABEL[me.volunteer.specializations[0].specialization] ?? 'Tình nguyện'}
                  </span>
                )}
              </div>
              {me.volunteer && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-100/90 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-amber-300">military_tech</span>
                    Hạng {me.volunteer.rank}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-amber-300">diamond</span>
                    {me.volunteer.dedicationPoints} điểm cống hiến
                  </span>
                </div>
              )}
              {/* Trust score badge inline */}
              <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
                <span className="material-symbols-outlined text-[16px] text-amber-400">stars</span>
                <span className="text-sm font-bold text-emerald-100">{me.trustScore} điểm tin cậy</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${trustBadgeColor(me.trustScore)}`}>
                  {trustLabel(me.trustScore)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-2xl font-bold text-sm shadow-lg shadow-black/10 transition-all hover:scale-[1.03] active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Chỉnh sửa hồ sơ
              </button>
            </div>
          </div>

          {/* mini stat strip */}
          <div className="mt-8 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl px-4 py-3 text-center">
                <p className="text-2xl md:text-3xl font-extrabold">{s.value}</p>
                <p className="text-[11px] text-emerald-100/90 font-semibold mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-12 md:h-16">
            <path d="M0 60L60 50C120 40 240 20 360 15C480 10 600 15 720 20C840 25 960 35 1080 40C1200 45 1320 45 1380 45L1440 45V60H0Z" fill="white"/>
          </svg>
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

              <div className="mt-5 space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-neutral-900">{me.trustScore}</span>
                  <span className="text-base font-bold text-neutral-400">/100</span>
                </div>
                <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(me.trustScore, 100)}%` }}
                  />
                </div>
              </div>

              <p className="mt-4 text-xs text-neutral-500 leading-relaxed font-medium">
                Bạn đã cứu được <span className="text-emerald-700 font-bold">{me.stats.kgSaved}kg</span> thực phẩm dư thừa. Hãy tiếp tục nhé!
              </p>

              {/* Trust history toggle */}
              <button
                onClick={() => setShowTrustHistory((v) => !v)}
                className="mt-3 w-full flex items-center justify-between py-2.5 px-3 rounded-xl border border-neutral-100 hover:border-amber-200 hover:bg-amber-50/50 transition-all text-xs font-bold text-neutral-600 hover:text-amber-700"
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
                    <div className="py-2.5 px-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-800 font-semibold leading-relaxed">
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
              {stats.map((s, i) => {
                const accents = [
                  { icon: 'text-teal-500 group-hover:text-teal-600', badge: 'bg-teal-50 text-teal-700 border-teal-200 group-hover:bg-teal-100 group-hover:border-teal-300' },
                  { icon: 'text-emerald-500 group-hover:text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 group-hover:bg-emerald-100 group-hover:border-emerald-300' },
                  { icon: 'text-rose-500 group-hover:text-rose-600', badge: 'bg-rose-50 text-rose-700 border-rose-200 group-hover:bg-rose-100 group-hover:border-rose-300' },
                ];
                const ac = accents[i] ?? accents[0];
                return (
                  <div
                    key={s.label}
                    className="group bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-default"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`material-symbols-outlined text-neutral-300 ${ac.icon} group-hover:scale-110 transition-all text-[28px]`}>
                        {s.icon}
                      </span>
                      <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-lg ${ac.badge} transition-colors`}>
                        {s.accent === 'emerald' ? 'Môi trường' : s.accent === 'teal' ? 'Khẩn cấp' : 'Cộng đồng'}
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className="text-4xl font-extrabold text-neutral-900">{s.value}</span>
                      <p className="text-xs text-neutral-500 font-semibold mt-0.5">{s.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick actions */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
              <h3 className="font-bold text-xs text-neutral-400 uppercase tracking-wider mb-4">Tiện ích</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Lịch sử nhận hàng', icon: 'history', href: '/history', accent: 'emerald' },
                  { label: 'Lịch sử giao hàng', icon: 'local_shipping', href: '/deliveries/history', accent: 'teal', hidden: !me.volunteer },
                  { label: 'Đánh giá', icon: 'rate_review', href: '#', accent: 'emerald' },
                  { label: 'Trợ giúp', icon: 'support_agent', href: '#', accent: 'emerald' },
                ].filter((a) => !a.hidden).map((action) => {
                  return (
                    <button
                      key={action.label}
                      onClick={() => {
                        if (action.href.startsWith('#')) {
                          toast.info('Tính năng đang phát triển.');
                          return;
                        }
                        router.push(action.href);
                      }}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-neutral-100 hover:border-emerald-200 hover:bg-emerald-50/60 text-center transition-all group"
                    >
                      <span className={`material-symbols-outlined text-[28px] text-neutral-400 group-hover:text-emerald-600 group-hover:scale-110 transition-all`}>
                        {action.icon}
                      </span>
                      <span className="text-xs font-bold text-neutral-700 group-hover:text-emerald-800 transition-colors">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 border-2 border-rose-200 text-rose-600 hover:bg-rose-50 rounded-2xl font-bold text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Đăng xuất tài khoản
            </button>
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
