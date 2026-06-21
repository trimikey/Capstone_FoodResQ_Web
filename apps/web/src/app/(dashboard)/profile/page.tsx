'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { useMe, useUpdateMe } from '@/hooks/useProfile';
import { UserRole } from '@foodresq/types';

const VOL_ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

const ROLE_LABEL: Record<string, string> = {
  [UserRole.RECEIVER]: 'Người nhận thực phẩm',
  [UserRole.PROVIDER]: 'Nhà cung cấp',
  [UserRole.VOLUNTEER]: 'Tình nguyện viên',
  [UserRole.ADMIN]: 'Quản trị viên',
};

function trustLabel(score: number): string {
  if (score >= 80) return 'Uy tín cao';
  if (score >= 60) return 'Uy tín tốt';
  if (score > 30) return 'Bị hạn chế';
  return 'Bị khóa';
}

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const router = useRouter();
  const { data: me, isLoading, isError } = useMe();
  const updateMe = useUpdateMe();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', avatarUrl: '' });

  // Đồng bộ form khi mở modal / khi dữ liệu về
  useEffect(() => {
    if (me) {
      setEditForm({
        fullName: me.fullName,
        phone: me.phone ?? '',
        avatarUrl: me.avatarUrl ?? '',
      });
    }
  }, [me]);

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
      <div className="min-h-screen bg-neutral-50/50 flex items-center justify-center py-20">
        <span className="animate-spin border-4 border-emerald-600 border-t-transparent rounded-full w-10 h-10" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="min-h-screen bg-neutral-50/50 flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="material-symbols-outlined text-rose-500 text-[48px]">wifi_off</span>
        <p className="font-bold text-neutral-700">Không tải được hồ sơ từ máy chủ</p>
      </div>
    );
  }

  // Tổ chức từ thiện là receiver có cờ isCharityOrg → hiển thị nhãn riêng cho rõ
  const roleLabel = me.receiver?.isCharityOrg ? 'Tổ chức từ thiện' : (ROLE_LABEL[me.role] ?? me.role);

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-4 space-y-6">
            {/* Profile Info Card */}
            <div className="bg-white rounded-3xl border border-neutral-200 p-8 flex flex-col items-center relative shadow-sm">
              <div className="relative w-28 h-28 rounded-full border-4 border-emerald-100 overflow-hidden bg-emerald-50 flex items-center justify-center">
                {me.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={me.avatarUrl} alt={me.fullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-extrabold text-emerald-700">
                    {me.fullName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold text-neutral-900 mt-4">{me.fullName}</h2>
              <div className="flex items-center gap-1 mt-1 text-xs text-neutral-500 font-semibold bg-neutral-50 px-3 py-1 rounded-full border border-neutral-100">
                <span className="material-symbols-outlined text-[14px] text-emerald-600">check_circle</span>
                <span>{roleLabel}</span>
              </div>

              {/* Chuyên môn tình nguyện viên (đầu bếp / phục vụ / giao hàng) */}
              {me.volunteer && me.volunteer.specializations.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                  {me.volunteer.specializations.map((s) => (
                    <span
                      key={s.specialization}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${s.isVerified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                    >
                      {VOL_ROLE_LABEL[s.specialization]}{s.isVerified ? ' ✓' : ' (chờ duyệt)'}
                    </span>
                  ))}
                </div>
              )}
              {me.volunteer && (
                <p className="text-[11px] text-neutral-400 mt-1.5">
                  Hạng {me.volunteer.rank} · {me.volunteer.dedicationPoints} điểm cống hiến
                </p>
              )}

              <div className="w-full h-px bg-neutral-200/80 my-6" />

              <div className="w-full space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px] text-neutral-600">mail</span>
                  </div>
                  <div className="space-y-0.5 text-left min-w-0">
                    <p className="text-[10px] text-neutral-450 font-bold uppercase tracking-wider">Email</p>
                    <p className="text-sm font-bold text-neutral-800 truncate max-w-[200px]">{me.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px] text-neutral-600">call</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <p className="text-[10px] text-neutral-450 font-bold uppercase tracking-wider">Số điện thoại</p>
                    <p className="text-sm font-bold text-neutral-800">{me.phone ?? 'Chưa cập nhật'}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsEditModalOpen(true)}
                className="w-full mt-6 py-3 bg-[#9AE69A] hover:bg-[#8CD88C] text-emerald-950 font-bold text-sm rounded-2xl transition-colors shadow-sm"
              >
                Chỉnh sửa hồ sơ
              </button>
            </div>

            {/* Trust Score Card */}
            <div className="bg-[#EAF5EC] border border-[#D5EAD9] rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-sm">
                  <span className="material-symbols-outlined text-[18px]">stars</span>
                  <span>Điểm Tin Cậy</span>
                </div>
                <span className="bg-emerald-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {trustLabel(me.trustScore)}
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-4xl font-extrabold text-emerald-950">
                  {me.trustScore}
                  <span className="text-base font-bold text-emerald-800">/100</span>
                </h3>
                <div className="h-2.5 w-full bg-emerald-200/40 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-800 rounded-full" style={{ width: `${me.trustScore}%` }} />
                </div>
              </div>

              <p className="text-xs text-emerald-900/80 leading-relaxed font-medium">
                Bạn đã cứu được {me.stats.kgSaved}kg thực phẩm dư thừa. Hãy tiếp tục nhé!
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-8 space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white border border-neutral-200 rounded-3xl p-6 flex flex-col justify-between min-h-[150px] shadow-sm">
                <div className="flex items-center gap-2 text-neutral-500 font-bold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">history</span>
                  <span>Đơn hoàn tất</span>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <span className="text-4xl font-extrabold text-neutral-900">{me.stats.completedCount}</span>
                  <button
                    onClick={() => router.push('/history')}
                    className="text-xs font-bold text-neutral-700 hover:text-emerald-800 underline transition-colors"
                  >
                    Xem tất cả
                  </button>
                </div>
              </div>

              <div className="bg-[#EAF5EC] border border-[#D5EAD9] rounded-3xl p-6 flex flex-col justify-between min-h-[150px] shadow-sm">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">scale</span>
                  <span>Đã cứu</span>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <span className="text-4xl font-extrabold text-emerald-950">{me.stats.kgSaved}</span>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200/50 px-2.5 py-1 rounded-lg">
                    kg
                  </span>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-3xl p-6 flex flex-col justify-between min-h-[150px] shadow-sm">
                <div className="flex items-center gap-2 text-neutral-500 font-bold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
                  <span>Đã giúp đỡ</span>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <span className="text-4xl font-extrabold text-neutral-900">{me.stats.providersHelped}</span>
                  <span className="text-xs font-bold text-neutral-500">cửa hàng</span>
                </div>
              </div>
            </div>

            {/* Support list card */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
              <h4 className="font-bold text-neutral-450 uppercase text-[10px] tracking-wider mb-3">Hỗ trợ</h4>

              <div className="divide-y divide-neutral-100">
                <button
                  onClick={() => router.push('/history')}
                  className="w-full py-3.5 flex items-center justify-between text-neutral-800 hover:text-emerald-800 text-sm font-bold transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-neutral-400">history</span>
                    <span>Lịch sử nhận hàng</span>
                  </div>
                  <span className="material-symbols-outlined text-neutral-400">chevron_right</span>
                </button>

                <button
                  onClick={() => toast.info('Trung tâm trợ giúp đang được phát triển.')}
                  className="w-full py-3.5 flex items-center justify-between text-neutral-800 hover:text-emerald-800 text-sm font-bold transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-neutral-400">help</span>
                    <span>Trung tâm trợ giúp</span>
                  </div>
                  <span className="material-symbols-outlined text-neutral-400">chevron_right</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full py-3.5 flex items-center justify-between text-red-600 hover:text-red-700 text-sm font-bold transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-red-500">logout</span>
                    <span>Đăng xuất</span>
                  </div>
                  <span className="material-symbols-outlined text-red-500">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EDIT PROFILE MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-150 flex justify-between items-center">
              <h3 className="font-extrabold text-neutral-900 text-lg">Chỉnh sửa hồ sơ</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 hover:bg-neutral-100 rounded-full text-neutral-450 hover:text-neutral-800"
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
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm disabled:opacity-50"
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
