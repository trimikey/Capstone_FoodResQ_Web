'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useAdminUsers,
  useAdminOverview,
  useSetUserStatus,
  useVerifications,
  useReviewVerification,
  useCreateUser,
  type AdminUser,
  type CreateUserInput,
} from '@/hooks/useAdmin';
import { mediaUrl } from '@/lib/utils';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const USER_ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  admin: { label: 'Quản trị', cls: 'badge-violet' },
  provider: { label: 'Nhà cung cấp', cls: 'badge-sky' },
  receiver: { label: 'Người nhận', cls: 'badge-honey' },
  volunteer: { label: 'Tình nguyện viên', cls: 'badge-emerald' },
};
const USER_STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: 'Đang hoạt động', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  pending_verification: { label: 'Chờ xét duyệt', dot: 'bg-honey-500', text: 'text-honey-700' },
  suspended: { label: 'Bị khóa', dot: 'bg-rose-500', text: 'text-rose-600' },
  banned: { label: 'Bị đình chỉ', dot: 'bg-rose-500', text: 'text-rose-600' },
};
const USER_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xét duyệt' },
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'suspended', label: 'Bị khóa' },
];

function trustToFive(score: number): number {
  return Math.round((score / 20) * 10) / 10;
}

function getDisplayStatus(u: AdminUser): string {
  if (u.status !== 'active') return u.status;
  if (u.role !== 'provider') return u.status;
  if (u.providerVerificationStatus === 'approved') return 'active';
  if (u.providerVerificationStatus === 'pending' || u.providerVerificationStatus === 'under_review') return 'pending_verification';
  if (u.providerVerificationStatus === 'rejected') return 'suspended';
  return u.status;
}

function getDisplayScore(u: AdminUser): { value: number; source: 'rating' | 'trust' } {
  if (u.role === 'provider' && u.providerAvgRating != null) return { value: u.providerAvgRating, source: 'rating' };
  return { value: trustToFive(u.trustScore), source: 'trust' };
}

function UserRow({ u, onAct, onDetail, pending }: { u: AdminUser; onAct: (id: string, s: 'active' | 'banned') => void; onDetail: () => void; pending: boolean }) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const role = u.isCharityOrg ? { label: 'Tổ chức từ thiện', cls: 'badge-violet' } : (USER_ROLE_BADGE[u.role] ?? { label: u.role, cls: 'badge-neutral' });
  const displayStatus = getDisplayStatus(u);
  const st = USER_STATUS_META[displayStatus] ?? { label: displayStatus, dot: 'bg-neutral-400', text: 'text-neutral-500' };
  const score = getDisplayScore(u);
  const goodScore = score.value >= 3;

  return (
    <tr className="hover:bg-neutral-50/50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {u.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(u.avatarUrl)} alt={u.fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
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
          {score.value.toFixed(1)}/5.0
        </span>
        <p className="text-[10px] font-semibold text-neutral-400 mt-0.5">{score.source === 'rating' ? 'Rating cửa hàng' : 'Trust quy đổi'}</p>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${st.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          {u.role !== 'admin' && u.status === 'pending_verification' && (
            <button onClick={onDetail} disabled={pending} className="px-4 py-1.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full text-xs font-bold transition-colors disabled:opacity-50">Xét duyệt</button>
          )}
          {u.role !== 'admin' && (displayStatus === 'banned' || displayStatus === 'suspended') && (
            <button onClick={() => onAct(u.id, 'active')} disabled={pending} className="px-4 py-1.5 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 rounded-full text-xs font-bold transition-colors disabled:opacity-50">Khôi phục</button>
          )}
          {u.role !== 'admin' && (
            <div className="relative">
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenu((v) => (v ? null : { top: rect.bottom + 4, right: window.innerWidth - rect.right }));
                }}
                className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
                aria-label="Mở menu hành động"
              >
                <span className="material-symbols-outlined text-[20px]">more_vert</span>
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                  <div
                    className="fixed w-44 bg-white border border-neutral-200 rounded-xl shadow-xl z-40 py-1 overflow-hidden"
                    style={{ top: menu.top, right: menu.right }}
                  >
                    <button onClick={() => { onDetail(); setMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">visibility</span>Xem chi tiết</button>
                    {displayStatus === 'banned' || displayStatus === 'suspended' ? (
                      <button onClick={() => { onAct(u.id, 'active'); setMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">lock_open</span>Mở khoá</button>
                    ) : (
                      <button onClick={() => { onAct(u.id, 'banned'); setMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">block</span>Khoá tài khoản</button>
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
  const { data: verifs } = useVerifications();
  const review = useReviewVerification();
  const [note, setNote] = useState('');
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  const verif =
    (verifs ?? []).find((v) => u.profileId && v.profileId === u.profileId) ??
    (verifs ?? []).find((v) => v.email?.toLowerCase() === u.email.toLowerCase());

  const role = u.isCharityOrg ? { label: 'Tổ chức từ thiện', cls: 'badge-violet' } : (USER_ROLE_BADGE[u.role] ?? { label: u.role, cls: 'badge-neutral' });
  const displayStatus = getDisplayStatus(u);
  const st = USER_STATUS_META[displayStatus] ?? { label: displayStatus, dot: 'bg-neutral-400', text: 'text-neutral-500' };
  const displayScore = getDisplayScore(u);
  const contactPhone = u.contactPhone || u.phone || verif?.contactPhone || verif?.phone || null;

  function markImageFailed(url: string) {
    setFailedImages((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  function imageTile(rawUrl: string, alt: string, badge: string, badgeClass: string, key?: string) {
    const url = mediaUrl(rawUrl);
    const failed = failedImages.has(url);

    return (
      <button
        type="button"
        key={key ?? rawUrl}
        onClick={() => {
          if (!failed) setZoomedImg(url);
        }}
        className={`relative aspect-square rounded-xl overflow-hidden border border-neutral-200 ${
          failed ? 'cursor-default bg-neutral-50' : 'hover:opacity-90'
        }`}
        title={failed ? 'Ảnh không còn tồn tại trên server' : 'Bấm để phóng to'}
      >
        {failed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-xs font-semibold text-neutral-500">
            <span className="material-symbols-outlined text-[28px] text-neutral-400">broken_image</span>
            <span>Không tải được ảnh</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={alt}
            className="w-full h-full object-cover"
            onError={() => markImageFailed(url)}
          />
        )}
        <span className={`absolute bottom-0 left-0 right-0 text-[10px] text-white text-center py-1 font-bold ${badgeClass}`}>
          {badge}
        </span>
      </button>
    );
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (!verif) return;
    try {
      await review.mutateAsync({ type: verif.type, id: verif.profileId, decision, note: note.trim() || undefined });
      toast.success(decision === 'approved' ? 'Đã duyệt hồ sơ' : 'Đã từ chối hồ sơ');
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-neutral-150 w-full max-w-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-neutral-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`badge ${role.cls}`}>{role.label}</span>
              {verif?.type === 'provider' && verif.businessType && (
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-semibold">
                  {verif.businessType === 'restaurant' && '🍜 Nhà hàng'}
                  {verif.businessType === 'supermarket' && '🛒 Siêu thị'}
                  {verif.businessType === 'bakery' && '🥖 Tiệm bánh'}
                  {verif.businessType === 'hotel' && '🏨 Khách sạn'}
                  {verif.businessType === 'other' && '📦 Khác'}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
              </span>
            </div>
            <h2 className="font-extrabold text-2xl text-neutral-900 mt-1.5">{u.fullName}</h2>
            <p className="text-sm text-neutral-500 mt-1">Đăng ký lúc {new Date(u.createdAt).toLocaleString('vi-VN')}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center shrink-0" aria-label="Đóng">
            <span className="material-symbols-outlined text-neutral-700">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[62vh] overflow-y-auto">
          <section>
            <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Thông tin liên hệ</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-50 rounded-2xl p-4">
              <div><p className="text-[11px] text-neutral-500">Email</p><p className="font-semibold text-neutral-900 break-all">{u.email}</p></div>
              <div><p className="text-[11px] text-neutral-500">Số điện thoại</p><p className="font-semibold text-neutral-900">{contactPhone || '—'}</p></div>
              <div>
                <p className="text-[11px] text-neutral-500">{displayScore.source === 'rating' ? 'Rating cửa hàng' : 'Điểm uy tín'}</p>
                <p className="font-semibold text-neutral-900">
                  {displayScore.source === 'rating' ? `${displayScore.value.toFixed(1)}/5.0` : `${u.trustScore}/100 (${displayScore.value.toFixed(1)}/5.0)`}
                </p>
              </div>
            </div>
          </section>

          {(u.faceImageUrl || u.idCardImageUrl) && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Xác minh khuôn mặt (eKYC)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {u.faceImageUrl && imageTile(u.faceImageUrl, 'Ảnh khuôn mặt đã đăng ký', 'Ảnh selfie', 'bg-emerald-700')}
                {u.idCardImageUrl && imageTile(u.idCardImageUrl, 'Ảnh CCCD đã đăng ký', 'CCCD', 'bg-neutral-800')}
              </div>
            </section>
          )}
          {!u.faceImageUrl && !u.idCardImageUrl && (u.role === 'receiver' || u.role === 'volunteer') && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-800">
              <strong>Chưa đăng ký khuôn mặt (eKYC).</strong> Tài khoản này chưa hoàn tất xác minh khuôn mặt bắt buộc.
            </div>
          )}

          {verif?.type === 'provider' && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Thông tin doanh nghiệp</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-50 rounded-2xl p-4">
                <div className="sm:col-span-2"><p className="text-[11px] text-neutral-500">Tên cửa hàng</p><p className="font-bold text-neutral-900">{verif.businessName || u.fullName}</p></div>
                <div><p className="text-[11px] text-neutral-500">Mã số thuế</p><p className="font-mono font-semibold text-neutral-900">{verif.taxCode ?? <span className="text-rose-600 italic">Không có (cá nhân/hộ gia đình)</span>}</p></div>
                <div><p className="text-[11px] text-neutral-500">Liên hệ NCC</p><p className="font-semibold text-neutral-900">{contactPhone || '—'}</p></div>
                {verif.address && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-neutral-500">Địa chỉ</p>
                    <p className="font-semibold text-neutral-900">{verif.address}</p>
                    {verif.lng != null && verif.lat != null && (
                      <a href={`https://www.google.com/maps?q=${verif.lat},${verif.lng}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline mt-1">
                        <span className="material-symbols-outlined text-sm">map</span>
                        Mở Google Maps ({verif.lat.toFixed(5)}, {verif.lng.toFixed(5)})
                      </a>
                    )}
                  </div>
                )}
                {verif.description && <div className="sm:col-span-2"><p className="text-[11px] text-neutral-500">Mô tả</p><p className="italic text-neutral-800">&ldquo;{verif.description}&rdquo;</p></div>}
              </div>
            </section>
          )}

          {verif?.type === 'provider' && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Bằng chứng ({verif.evidenceUrls?.length ?? 0} ảnh)</h3>
              {!verif.evidenceUrls || verif.evidenceUrls.length === 0 ? (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-800">
                  <strong>Không có ảnh minh chứng.</strong> Cân nhắc từ chối vì không đủ điều kiện xác minh.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {verif.evidenceUrls.map((eu: string, i: number) =>
                    imageTile(
                      eu,
                      `evidence-${i + 1}`,
                      i === 0 ? 'GPKD / ĐKKD' : `#${i + 1}`,
                      i === 0 ? 'bg-emerald-700' : 'bg-black/70',
                      `${eu}-${i}`,
                    ),
                  )}
                </div>
              )}
            </section>
          )}

          {verif?.type === 'volunteer' && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Mô tả năng lực</h3>
              <div className="bg-neutral-50 rounded-2xl p-4 text-sm text-neutral-800">{verif.detail}</div>
            </section>
          )}

          {verif && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Ghi chú cho NCC/TNV (tuỳ chọn, sẽ gửi kèm kết quả)</h3>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={verif.type === 'provider' ? 'Ví dụ: GPKD rõ, địa chỉ khớp Google Maps. OK duyệt.' : 'Ví dụ: Chuyên môn đầu bếp phù hợp.'}
                className="w-full px-4 py-3 bg-white border-2 border-neutral-200 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-neutral-400 resize-none" />
            </section>
          )}
        </div>

        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex gap-3 justify-end">
          <button onClick={onClose} disabled={review.isPending} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-700 rounded-full font-bold text-sm hover:bg-neutral-50">Đóng</button>
          {verif ? (
            <>
              <button onClick={() => void decide('rejected')} disabled={review.isPending} className="px-5 py-2.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-full font-bold text-sm disabled:opacity-50">Từ chối</button>
              <button onClick={() => void decide('approved')} disabled={review.isPending} className="px-5 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full font-bold text-sm disabled:opacity-50 shadow-sm">Duyệt hồ sơ</button>
            </>
          ) : u.role !== 'admin' && (
            displayStatus === 'banned' || displayStatus === 'suspended' ? (
              <button onClick={() => { onAct(u.id, 'active'); onClose(); }} className="px-5 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full font-bold text-sm shadow-sm">Khôi phục tài khoản</button>
            ) : displayStatus === 'pending_verification' ? (
              <>
                <button onClick={() => { onAct(u.id, 'banned'); onClose(); }} className="px-5 py-2.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-full font-bold text-sm">Từ chối</button>
                <button onClick={() => { onAct(u.id, 'active'); onClose(); }} className="px-5 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-full font-bold text-sm shadow-sm">Duyệt tài khoản</button>
              </>
            ) : (
              <button onClick={() => { onAct(u.id, 'banned'); onClose(); }} className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full font-bold text-sm">Khoá tài khoản</button>
            )
          )}
        </div>
      </div>

      {zoomedImg && (
        <div role="dialog" aria-modal="true" onClick={(e) => { e.stopPropagation(); setZoomedImg(null); }}
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomedImg}
            alt="zoom"
            className="max-w-full max-h-full object-contain cursor-default"
            onClick={(e) => e.stopPropagation()}
            onError={() => {
              markImageFailed(zoomedImg);
              setZoomedImg(null);
              toast.error('Không tải được ảnh. File có thể đã mất trên server.');
            }}
          />
        </div>
      )}
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

export default function UsersTab() {
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
    const displayStatus = getDisplayStatus(u);
    if (filter === 'pending') return displayStatus === 'pending_verification';
    if (filter === 'active') return displayStatus === 'active';
    if (filter === 'suspended') return displayStatus === 'banned' || displayStatus === 'suspended';
    return true;
  });
  const paged = usePaged(filtered, 8, `${q}-${filter}`);

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý Tài khoản</h2>
          <p className="text-sm text-neutral-500 mt-1">Theo dõi và quản lý cộng đồng Food Rescue của bạn.</p>
        </div>
        <div className="flex gap-1 bg-white border border-neutral-200 rounded-full p-1 w-fit shadow-sm">
          {USER_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${filter === f.key ? 'bg-[#166534] text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

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

      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[20px]">search</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người dùng..."
          className="w-full bg-white border border-neutral-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none shadow-sm" />
      </div>

      {isLoading ? <Skeleton /> : filtered.length === 0 ? (
        <Empty icon="group" text="Không tìm thấy tài khoản phù hợp" />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-3xl overflow-visible shadow-sm">
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

      <button onClick={() => setShowCreate(true)} title="Thêm tài khoản"
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-[#166534] hover:bg-[#14532d] text-white shadow-lg flex items-center justify-center transition-colors z-20">
        <span className="material-symbols-outlined">person_add</span>
      </button>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {detailUser && <UserDetailModal u={detailUser} onClose={() => setDetailUser(null)} onAct={act} />}
    </div>
  );
}
