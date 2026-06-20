'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useCampaigns, useApplyCampaign, useCreateCampaign, useMyTasks, type Campaign } from '@/hooks/useCampaigns';
import { useMe } from '@/hooks/useProfile';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { AssignmentRole, UserRole } from '@foodresq/types';

const ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

// Mỗi vai trò một sắc thái màu riêng để dễ phân biệt khi quét nhanh
const ROLE_META: Record<string, { label: string; icon: string; badge: string; bar: string; soft: string; text: string }> = {
  chef: { label: 'Đầu bếp', icon: 'skillet', badge: 'badge-honey', bar: 'bg-honey-400', soft: 'bg-honey-50', text: 'text-honey-700' },
  waiter: { label: 'Phục vụ', icon: 'room_service', badge: 'badge-sky', bar: 'bg-sky-400', soft: 'bg-sky-50', text: 'text-sky-700' },
  shipper: { label: 'Giao hàng', icon: 'local_shipping', badge: 'badge-emerald', bar: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700' },
};

const TASK_STATUS_META: Record<string, { label: string; badge: string }> = {
  assigned: { label: 'Đã nhận việc', badge: 'badge-sky' },
  checked_in: { label: 'Đã điểm danh', badge: 'badge-emerald' },
  in_progress: { label: 'Đang làm', badge: 'badge-honey' },
  completed: { label: 'Hoàn thành', badge: 'badge-emerald' },
  absent: { label: 'Vắng', badge: 'badge-rose' },
  cancelled: { label: 'Đã huỷ', badge: 'badge-neutral' },
};

export default function CampaignsPage() {
  const { data: me } = useMe();
  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isReceiver = me?.role === UserRole.RECEIVER;

  const { data, isLoading } = useCampaigns();
  const { data: vol } = useVolunteerMe(); // chỉ chạy khi là volunteer (endpoint role-guarded)
  const { data: myTasks } = useMyTasks(!!isVolunteer);
  const apply = useApplyCampaign();
  const create = useCreateCampaign();
  const [showForm, setShowForm] = useState(false);

  const campaigns = data ?? [];
  // Vai trò TNV được phép ứng tuyển (theo chuyên môn đã đăng ký)
  const myRoles = (vol?.specializations ?? []).map((s) => s.specialization);

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
    <div className="min-h-screen bg-mesh-brand pb-24">
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-10 space-y-7">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-3xl bg-brand-gradient elevation-brand p-7 md:p-9 text-white">
          <span className="material-symbols-outlined absolute -right-6 -top-6 text-white/10 text-[180px] select-none pointer-events-none animate-floaty">soup_kitchen</span>
          <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div>
              <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold mb-3">
                <span className="material-symbols-outlined text-[15px]">volunteer_activism</span> Hoạt động cộng đồng
              </span>
              <h1 className="font-headline-lg font-extrabold text-3xl md:text-4xl leading-tight">Bếp ăn cộng đồng</h1>
              <p className="text-sm text-white/80 mt-2 max-w-md">Cùng nấu &amp; trao bữa ăn ấm cho người cần. Mỗi suất ăn là một câu chuyện tử tế.</p>
            </div>
            {isReceiver && (
              <button onClick={() => setShowForm(true)} className="squishy-button shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-white text-emerald-800 rounded-2xl font-bold text-sm shadow-lg hover:bg-emerald-50 transition-colors">
                <span className="material-symbols-outlined text-[20px]">add</span> Tạo chiến dịch
              </button>
            )}
          </div>
          {/* Mini stats */}
          <div className="relative mt-6 flex flex-wrap gap-2.5">
            <HeroStat icon="campaign" value={campaigns.length} label="chiến dịch đang mở" />
            {isVolunteer && <HeroStat icon="assignment_turned_in" value={myTasks?.length ?? 0} label="việc của bạn" />}
          </div>
        </div>

        {/* Việc của tôi (TNV đã đăng ký) */}
        {isVolunteer && myTasks && myTasks.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">assignment_ind</span> Việc của tôi
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {myTasks.map((t) => {
                const rm = ROLE_META[t.role];
                const st = TASK_STATUS_META[t.status] ?? { label: t.status, badge: 'badge-neutral' };
                return (
                  <div key={t.id} className="card-interactive bg-white border border-neutral-150 rounded-2xl p-4 elevation-1">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`badge ${rm?.badge ?? 'badge-neutral'}`}>
                        <span className="material-symbols-outlined text-[14px]">{rm?.icon ?? 'work'}</span>{rm?.label ?? t.role}
                      </span>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                    </div>
                    <h3 className="font-bold text-neutral-900 text-sm truncate">{t.campaign.title}</h3>
                    <p className="text-xs text-neutral-500 mt-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">event</span>
                      {new Date(t.campaign.scheduledDate).toLocaleDateString('vi-VN')} · {t.campaign.startTime}–{t.campaign.endTime}
                    </p>
                    <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">place</span>{t.campaign.kitchenAddress}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {isVolunteer && (
          <h2 className="font-extrabold text-lg text-neutral-900 pt-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-honey-500">local_fire_department</span> Chiến dịch đang tuyển
          </h2>
        )}

        {isLoading && (
          <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-48 skeleton" />)}</div>
        )}

        {!isLoading && campaigns.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-neutral-200 elevation-1">
            <div className="w-20 h-20 mx-auto rounded-full bg-brand-gradient-soft flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 text-[44px]">soup_kitchen</span>
            </div>
            <p className="font-bold text-neutral-700 mt-4">Chưa có chiến dịch nào đang mở</p>
            <p className="text-sm text-neutral-400 mt-1">Quay lại sau hoặc theo dõi thông báo để không bỏ lỡ.</p>
          </div>
        )}

        <div className="space-y-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} c={c} myRoles={isVolunteer ? myRoles : []} onApply={handleApply} applying={apply.isPending} />
          ))}
        </div>
      </div>

      {showForm && <CreateCampaignModal onClose={() => setShowForm(false)} onSubmit={create.mutateAsync} pending={create.isPending} />}
    </div>
  );
}

function HeroStat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 bg-white/12 backdrop-blur rounded-2xl pl-3 pr-4 py-2 border border-white/15">
      <span className="material-symbols-outlined text-[20px] text-honey-200">{icon}</span>
      <div className="leading-none">
        <span className="font-extrabold text-lg">{value}</span>
        <span className="text-[11px] text-white/70 ml-1.5">{label}</span>
      </div>
    </div>
  );
}

function Slot({ role, filled, needed, canApply, onApply, applying }: {
  role: AssignmentRole; filled: number; needed: number; canApply: boolean;
  onApply: (role: AssignmentRole) => void; applying: boolean;
}) {
  if (needed <= 0) return null;
  const full = filled >= needed;
  const rm = ROLE_META[role];
  const pct = Math.min(100, Math.round((filled / needed) * 100));
  return (
    <div className={`rounded-2xl border border-neutral-150 p-3 ${rm.soft}`}>
      <div className="flex items-center gap-1.5">
        <span className={`material-symbols-outlined text-[18px] ${rm.text}`}>{rm.icon}</span>
        <span className="text-xs font-bold text-neutral-700">{rm.label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-extrabold text-lg text-neutral-900">{filled}</span>
        <span className="text-xs text-neutral-400">/ {needed}</span>
      </div>
      {/* progress */}
      <div className="mt-1.5 h-1.5 rounded-full bg-white/70 overflow-hidden">
        <div className={`h-full rounded-full ${rm.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {canApply && (
        <button
          onClick={() => onApply(role)}
          disabled={full || applying}
          className="mt-2.5 w-full py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
        >
          {full ? 'Đã đủ' : 'Đăng ký'}
        </button>
      )}
    </div>
  );
}

// myRoles: vai trò TNV được phép ứng tuyển (rỗng = không phải TNV, không hiện nút)
function CampaignCard({ c, myRoles, onApply, applying }: {
  c: Campaign; myRoles: string[]; onApply: (id: string, role: AssignmentRole) => void; applying: boolean;
}) {
  const dateStr = new Date(c.scheduledDate).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return (
    <div className="card-interactive bg-white border border-neutral-150 rounded-3xl overflow-hidden elevation-1">
      {/* Colored header strip */}
      <div className="bg-brand-gradient-soft px-5 pt-5 pb-4 border-b border-emerald-100/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-extrabold text-neutral-900 text-lg leading-snug">{c.title}</h3>
            <p className="text-xs text-neutral-500 mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-emerald-600">place</span>{c.kitchenAddress}
            </p>
          </div>
          <div className="shrink-0 text-center bg-white rounded-2xl px-3 py-2 border border-emerald-100 elevation-1">
            <p className="text-[10px] font-bold text-emerald-600 uppercase">{dateStr}</p>
            <p className="text-xs font-extrabold text-neutral-800 mt-0.5">{c.startTime}–{c.endTime}</p>
          </div>
        </div>
        {c.description && <p className="text-sm text-neutral-600 mt-3">{c.description}</p>}
      </div>

      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-2.5">
          <Slot role={AssignmentRole.CHEF} filled={c.chefSlotsFilled} needed={c.chefSlotsNeeded} canApply={myRoles.includes('chef')} onApply={(r) => onApply(c.id, r)} applying={applying} />
          <Slot role={AssignmentRole.WAITER} filled={c.waiterSlotsFilled} needed={c.waiterSlotsNeeded} canApply={myRoles.includes('waiter')} onApply={(r) => onApply(c.id, r)} applying={applying} />
          <Slot role={AssignmentRole.SHIPPER} filled={c.shipperSlotsFilled} needed={c.shipperSlotsNeeded} canApply={myRoles.includes('shipper')} onApply={(r) => onApply(c.id, r)} applying={applying} />
        </div>
        {myRoles.length === 0 && (
          <p className="text-[11px] text-neutral-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            Chỉ tình nguyện viên mới đăng ký được — theo đúng chuyên môn của mình.
          </p>
        )}

        {/* Tình nguyện viên đã tham gia + vai trò */}
        {c.assignments && c.assignments.length > 0 && (
          <div className="border-t border-neutral-100 pt-3">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2">
              Đã tham gia ({c.assignments.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {c.assignments.map((a) => {
                const rm = ROLE_META[a.role];
                return (
                  <span key={a.id} className="inline-flex items-center gap-1.5 bg-neutral-50 border border-neutral-150 rounded-full pl-1 pr-2.5 py-0.5">
                    <span className={`w-5 h-5 rounded-full ${rm?.soft ?? 'bg-neutral-100'} flex items-center justify-center text-[9px] font-bold ${rm?.text ?? 'text-neutral-700'}`}>
                      {a.volunteer.user.fullName.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-700">{a.volunteer.user.fullName}</span>
                    <span className={`text-[10px] font-bold ${rm?.text ?? 'text-neutral-500'}`}>· {ROLE_LABEL[a.role]}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
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
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto animate-fade-in-up">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-neutral-150 w-full max-w-lg my-8 elevation-3 overflow-hidden">
        <div className="bg-brand-gradient px-6 py-5 text-white flex items-center gap-3">
          <span className="material-symbols-outlined">soup_kitchen</span>
          <h3 className="font-extrabold text-lg">Tạo chiến dịch bếp ăn</h3>
        </div>
        <div className="p-6 space-y-4">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Tiêu đề *" className="input-base" required minLength={5} />
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Mô tả" rows={2} className="input-base" />
          <input value={f.kitchenAddress} onChange={(e) => setF({ ...f, kitchenAddress: e.target.value })} placeholder="Địa chỉ bếp *" className="input-base" required minLength={5} />
          <div className="grid grid-cols-3 gap-3">
            <input type="date" value={f.scheduledDate} onChange={(e) => setF({ ...f, scheduledDate: e.target.value })} className="input-base" required />
            <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className="input-base" required />
            <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className="input-base" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-bold text-honey-700 space-y-1 block">Đầu bếp<input type="number" min={0} value={f.chefSlotsNeeded} onChange={(e) => setF({ ...f, chefSlotsNeeded: Number(e.target.value) })} className="input-base" /></label>
            <label className="text-xs font-bold text-sky-700 space-y-1 block">Phục vụ<input type="number" min={0} value={f.waiterSlotsNeeded} onChange={(e) => setF({ ...f, waiterSlotsNeeded: Number(e.target.value) })} className="input-base" /></label>
            <label className="text-xs font-bold text-emerald-700 space-y-1 block">Giao hàng<input type="number" min={0} value={f.shipperSlotsNeeded} onChange={(e) => setF({ ...f, shipperSlotsNeeded: Number(e.target.value) })} className="input-base" /></label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors">Huỷ</button>
            <button type="submit" disabled={pending} className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-colors">{pending ? 'Đang tạo...' : 'Tạo chiến dịch'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
