'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useCampaigns, useApplyCampaign, useCreateCampaign, type Campaign } from '@/hooks/useCampaigns';
import { useMe } from '@/hooks/useProfile';
import { AssignmentRole, UserRole } from '@foodresq/types';

const ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

export default function CampaignsPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useCampaigns();
  const apply = useApplyCampaign();
  const create = useCreateCampaign();
  const [showForm, setShowForm] = useState(false);

  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isReceiver = me?.role === UserRole.RECEIVER;
  const campaigns = data ?? [];

  async function handleApply(id: string, role: AssignmentRole) {
    try {
      await apply.mutateAsync({ id, role });
      toast.success(`Đã đăng ký vai trò ${ROLE_LABEL[role]}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Đăng ký thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-extrabold text-3xl text-neutral-900">Bếp ăn cộng đồng</h1>
            <p className="text-sm text-neutral-500 mt-1">Chiến dịch nấu & phát thực phẩm cần tình nguyện viên</p>
          </div>
          {isReceiver && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm">
              <span className="material-symbols-outlined text-[20px]">add</span> Tạo chiến dịch
            </button>
          )}
        </div>

        {isLoading && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 rounded-2xl bg-white border border-neutral-200 animate-pulse" />)}</div>}

        {!isLoading && campaigns.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-neutral-200">
            <span className="material-symbols-outlined text-neutral-300 text-[56px]">soup_kitchen</span>
            <p className="font-bold text-neutral-600 mt-3">Chưa có chiến dịch nào đang mở</p>
          </div>
        )}

        <div className="space-y-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} c={c} canApply={!!isVolunteer} onApply={handleApply} applying={apply.isPending} />
          ))}
        </div>
      </div>

      {showForm && <CreateCampaignModal onClose={() => setShowForm(false)} onSubmit={create.mutateAsync} pending={create.isPending} />}
    </div>
  );
}

function Slot({ role, filled, needed, canApply, onApply, applying }: {
  role: AssignmentRole; filled: number; needed: number; canApply: boolean;
  onApply: (role: AssignmentRole) => void; applying: boolean;
}) {
  if (needed <= 0) return null;
  const full = filled >= needed;
  return (
    <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-3 py-2">
      <span className="text-xs font-bold text-neutral-700">{ROLE_LABEL[role]}: {filled}/{needed}</span>
      {canApply && (
        <button
          onClick={() => onApply(role)}
          disabled={full || applying}
          className="px-3 py-1 rounded-lg text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {full ? 'Đủ' : 'Đăng ký'}
        </button>
      )}
    </div>
  );
}

function CampaignCard({ c, canApply, onApply, applying }: {
  c: Campaign; canApply: boolean; onApply: (id: string, role: AssignmentRole) => void; applying: boolean;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-extrabold text-neutral-900">{c.title}</h3>
        <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">place</span>{c.kitchenAddress}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {new Date(c.scheduledDate).toLocaleDateString('vi-VN')} · {c.startTime}–{c.endTime}
        </p>
        {c.description && <p className="text-sm text-neutral-600 mt-2">{c.description}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Slot role={AssignmentRole.CHEF} filled={c.chefSlotsFilled} needed={c.chefSlotsNeeded} canApply={canApply} onApply={(r) => onApply(c.id, r)} applying={applying} />
        <Slot role={AssignmentRole.WAITER} filled={c.waiterSlotsFilled} needed={c.waiterSlotsNeeded} canApply={canApply} onApply={(r) => onApply(c.id, r)} applying={applying} />
        <Slot role={AssignmentRole.SHIPPER} filled={c.shipperSlotsFilled} needed={c.shipperSlotsNeeded} canApply={canApply} onApply={(r) => onApply(c.id, r)} applying={applying} />
      </div>
    </div>
  );
}

function CreateCampaignModal({ onClose, onSubmit, pending }: {
  onClose: () => void;
  onSubmit: (input: import('@/hooks/useCampaigns').CreateCampaignInput) => Promise<unknown>;
  pending: boolean;
}) {
  const [f, setF] = useState({
    title: '', description: '', kitchenAddress: '',
    scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startTime: '08:00', endTime: '12:00',
    chefSlotsNeeded: 2, waiterSlotsNeeded: 3, shipperSlotsNeeded: 2, expectedServings: 100,
  });
  const cls = 'w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 5) { toast.error('Tiêu đề tối thiểu 5 ký tự'); return; }
    try {
      await onSubmit({ ...f, lng: 106.6297, lat: 10.8231 }); // mặc định tâm HCM
      toast.success('Đã tạo chiến dịch');
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Tạo thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-neutral-200 w-full max-w-lg my-8 p-6 space-y-4">
        <h3 className="font-extrabold text-lg text-neutral-900">Tạo chiến dịch bếp ăn</h3>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Tiêu đề *" className={cls} required minLength={5} />
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Mô tả" rows={2} className={cls} />
        <input value={f.kitchenAddress} onChange={(e) => setF({ ...f, kitchenAddress: e.target.value })} placeholder="Địa chỉ bếp *" className={cls} required minLength={5} />
        <div className="grid grid-cols-3 gap-3">
          <input type="date" value={f.scheduledDate} onChange={(e) => setF({ ...f, scheduledDate: e.target.value })} className={cls} required />
          <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className={cls} required />
          <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className={cls} required />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs font-bold text-neutral-500">Đầu bếp<input type="number" min={0} value={f.chefSlotsNeeded} onChange={(e) => setF({ ...f, chefSlotsNeeded: Number(e.target.value) })} className={cls} /></label>
          <label className="text-xs font-bold text-neutral-500">Phục vụ<input type="number" min={0} value={f.waiterSlotsNeeded} onChange={(e) => setF({ ...f, waiterSlotsNeeded: Number(e.target.value) })} className={cls} /></label>
          <label className="text-xs font-bold text-neutral-500">Giao hàng<input type="number" min={0} value={f.shipperSlotsNeeded} onChange={(e) => setF({ ...f, shipperSlotsNeeded: Number(e.target.value) })} className={cls} /></label>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl">Huỷ</button>
          <button type="submit" disabled={pending} className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50">{pending ? 'Đang tạo...' : 'Tạo'}</button>
        </div>
      </form>
    </div>
  );
}
