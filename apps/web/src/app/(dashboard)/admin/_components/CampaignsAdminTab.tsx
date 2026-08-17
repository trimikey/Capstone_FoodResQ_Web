'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { vnTomorrow } from '@/lib/vn-date';
import {
  useAdminCampaigns,
  useSetCampaignStatus,
  useAdminCampaignDetail,
  useAdminCharities,
  useAdminVolunteers,
  useCreateAdminCampaign,
  useUpdateAdminCampaign,
  useAssignVolunteer,
  useUnassignVolunteer,
  type AdminCampaign,
  type AdminCampaignDetail,
} from '@/hooks/useAdmin';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const CAMPAIGN_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Chờ duyệt', cls: 'bg-honey-100 text-honey-800' },
  approved: { label: 'Đã duyệt', cls: 'bg-sky-100 text-sky-700' },
  in_progress: { label: 'Đang diễn ra', cls: 'bg-honey-100 text-honey-800' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700' },
};
const CAMPAIGN_STATUS_OPTS: AdminCampaign['status'][] = ['pending_approval', 'approved', 'in_progress', 'completed', 'cancelled'];

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
const ROLE_VN_MAP: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

function formatRequestedAt(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleString('vi-VN');
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
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

function AssignSection({ campaignId }: { campaignId: string }) {
  const [role, setRole] = useState<'chef' | 'waiter' | 'shipper'>('chef');
  const [volId, setVolId] = useState('');
  const [override, setOverride] = useState(false);
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
        <select value={role} onChange={(e) => { setRole(e.target.value as 'chef' | 'waiter' | 'shipper'); setVolId(''); }}
          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="chef">Đầu bếp</option>
          <option value="waiter">Phục vụ</option>
          <option value="shipper">Giao hàng</option>
        </select>
        <select value={volId} onChange={(e) => setVolId(e.target.value)}
          className="flex-1 bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="">{isLoading ? 'Đang tải...' : (vols && vols.length ? '— Chọn tình nguyện viên —' : 'Không có TNV phù hợp')}</option>
          {(vols ?? []).map((v) => (
            <option key={v.volunteerId} value={v.volunteerId}>
              {v.fullName}{override && v.specializations.length ? ` (${v.specializations.map((s) => ROLE_VN_MAP[s] ?? s).join(', ')})` : ''}
            </option>
          ))}
        </select>
        <button onClick={doAssign} disabled={assign.isPending || !volId}
          className="px-4 py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1 disabled:opacity-40 transition-colors">
          <span className="material-symbols-outlined text-[18px]">person_add</span> Gán
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-neutral-500 cursor-pointer select-none">
        <input type="checkbox" checked={override} onChange={(e) => { setOverride(e.target.checked); setVolId(''); }}
          className="w-4 h-4 rounded accent-emerald-600" />
        Gán vượt chuyên môn (cho phép chọn mọi tình nguyện viên)
      </label>
    </div>
  );
}

function CampaignDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: c, isLoading } = useAdminCampaignDetail(id);

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-neutral-150 w-full max-w-2xl my-8 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#166534] px-6 py-5 text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-extrabold text-lg truncate">{c?.title ?? 'Chi tiết chiến dịch'}</p>
            {c && <p className="text-xs text-emerald-100 mt-0.5">{c.charity}{c.charityPhone ? ` · ${c.charityPhone}` : ''}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onClose} className="p-1 hover:bg-white/15 rounded-full"><span className="material-symbols-outlined">close</span></button>
          </div>
        </div>

        {isLoading || !c ? (
          <div className="p-6"><Skeleton /></div>
        ) : (
          <div className="p-6 space-y-5">
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

            <div>
              <h4 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">groups</span>
                Tình nguyện viên ({c.assignments.length})
              </h4>
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
    scheduledDate: campaign ? campaign.scheduledDate.slice(0, 10) : vnTomorrow(),
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

export default function CampaignsAdminTab() {
  const [status, setStatus] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, isLoading } = useAdminCampaigns(status || undefined);
  const setCampaignStatus = useSetCampaignStatus();
  const paged = usePaged(data ?? [], 8, status);
  const pendingCampaigns = (data ?? []).filter((c) => c.status === 'pending_approval');

  async function changeStatus(id: string, st: 'approved' | 'cancelled') {
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
          <p className="text-sm text-neutral-500 mt-1">Duyệt chiến dịch mới. Duyệt/từ chối tình nguyện viên do tổ chức từ thiện phụ trách.</p>
        </div>
      </div>

      {pendingCampaigns.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="material-symbols-outlined text-[22px] text-amber-600">pending_actions</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-amber-900">{pendingCampaigns.length} chiến dịch đang chờ duyệt</p>
            <p className="mt-0.5 truncate text-xs text-amber-800">
              Mới nhất: <b>{pendingCampaigns[0].title}</b> — {pendingCampaigns[0].charity} · gửi {formatRequestedAt(pendingCampaigns[0].createdAt)}
            </p>
          </div>
          {status !== 'pending_approval' && (
            <button onClick={() => setStatus('pending_approval')}
              className="shrink-0 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
              Chỉ xem đơn chờ duyệt
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[{ v: '', l: 'Tất cả' }, ...CAMPAIGN_STATUS_OPTS.map((s) => ({ v: s, l: CAMPAIGN_STATUS_META[s].label }))].map((opt) => (
          <button key={opt.v} onClick={() => setStatus(opt.v)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${status === opt.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
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
                  <th className="px-6 py-4 w-[28%]">Chiến dịch</th>
                  <th className="px-6 py-4">Tổ chức</th>
                  <th className="px-6 py-4">Ngày yêu cầu</th>
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-neutral-700">{new Date(c.createdAt).toLocaleDateString('vi-VN')}</p>
                        <p className="text-[11px] text-neutral-400">{formatRequestedAt(c.createdAt)}</p>
                      </td>
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
                        {c.status === 'pending_approval' ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => changeStatus(c.id, 'approved')} disabled={setCampaignStatus.isPending}
                              className="w-[88px] h-8 bg-[#166534] hover:bg-[#14532d] text-white rounded-full text-xs font-bold transition-colors disabled:opacity-50 inline-flex items-center justify-center">
                              Duyệt
                            </button>
                            <button onClick={() => changeStatus(c.id, 'cancelled')} disabled={setCampaignStatus.isPending}
                              className="w-[88px] h-8 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-full text-xs font-bold transition-colors disabled:opacity-50 inline-flex items-center justify-center">
                              Từ chối
                            </button>
                          </div>
                        ) : <span className="text-xs font-semibold text-neutral-400">Vòng đời tự động</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setDetailId(c.id)} title="Xem danh sách tình nguyện viên"
                          className="w-9 h-9 rounded-full border border-neutral-200 inline-flex items-center justify-center text-neutral-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
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
    </div>
  );
}
