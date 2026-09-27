'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useCampaignIncidents,
  useReassignCampaignIncident,
  useResolveCampaignIncident,
  type CampaignIncident,
  type CampaignManageParticipant,
  type IncidentContext,
} from '@/hooks/useCampaigns';
import { INCIDENT_CONTEXT_LABEL } from '@/lib/campaign-incidents';
import { errMsg, mediaUrl } from '@/lib/utils';

/**
 * Sự cố shipper báo trong chiến dịch — cho TỔ CHỨC xem và đánh dấu đã xử lý.
 * `context` lọc theo trang (Giao & nhận hàng = pickup, Phân phối = distribution).
 */
const OPS_ROLES = ['shipper', 'waiter'];
const APPROVED = ['assigned', 'checked_in', 'in_progress', 'completed'];

export default function CampaignIncidentsPanel({
  campaignId,
  context,
  participants = [],
}: {
  campaignId: string;
  context?: IncidentContext;
  /** TNV của chiến dịch — để chọn người thay khi shipper không đi tiếp được. */
  participants?: CampaignManageParticipant[];
}) {
  const { data, isLoading } = useCampaignIncidents(campaignId);
  // Sự cố đang CHẶN việc (shipper bỏ dở) lên đầu — cần xử lý trước.
  const rows = (data ?? [])
    .filter((r) => !context || r.context === context)
    .sort(
      (a, b) =>
        Number(b.status === 'open' && !b.canContinue) - Number(a.status === 'open' && !a.canContinue) ||
        Number(b.status === 'open') - Number(a.status === 'open'),
    );
  const open = rows.filter((r) => r.status === 'open');

  if (isLoading || rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-rose-800">
        <span className="material-symbols-outlined text-[18px]">report</span>
        Sự cố shipper báo ({open.length} chưa xử lý / {rows.length})
      </h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <IncidentRow key={r.id} incident={r} campaignId={campaignId} participants={participants} />
        ))}
      </div>
    </section>
  );
}

function IncidentRow({
  incident: r,
  campaignId,
  participants,
}: {
  incident: CampaignIncident;
  campaignId: string;
  participants: CampaignManageParticipant[];
}) {
  const resolve = useResolveCampaignIncident();
  const reassign = useReassignCampaignIncident();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const isOpen = r.status === 'open';
  const blocking = isOpen && !r.canContinue;

  // Người thay: TNV giao hàng & phục vụ đã duyệt, trừ chính người báo sự cố.
  // Đơn nguyên liệu phân theo CA (assignment id, BE kiểm ca phủ khung giờ lấy);
  // đợt phát phân theo NGƯỜI (volunteer id).
  const ops = participants.filter(
    (p) => OPS_ROLES.includes(p.role) && APPROVED.includes(p.status) && p.volunteerId !== r.reporterVolunteerId,
  );
  const candidates =
    r.context === 'pickup'
      ? ops.map((p) => ({
          id: p.id,
          label: p.fullName,
          sub: [p.shift?.label, p.workDate?.slice(0, 10)].filter(Boolean).join(' · '),
        }))
      : [...new Map(ops.map((p) => [p.volunteerId, p])).values()].map((p) => ({
          id: p.volunteerId,
          label: p.fullName,
          sub: '',
        }));
  const pickedIds = candidates.filter((c) => picked[c.id]).map((c) => c.id);

  async function submitReassign() {
    if (pickedIds.length === 0) return toast.error('Chọn ít nhất một người thay.');
    try {
      const res = await reassign.mutateAsync({ incidentId: r.id, campaignId, ids: pickedIds });
      toast.success(`Đã đổi sang ${res.reassignedTo.join(', ')} — họ đã được báo.`);
    } catch (e) {
      toast.error(errMsg(e, 'Không đổi được shipper'));
    }
  }

  async function submit() {
    try {
      await resolve.mutateAsync({ incidentId: r.id, campaignId, note: note.trim() || undefined });
      toast.success('Đã đánh dấu xử lý — shipper đã được báo.');
      setResolving(false);
    } catch (e) {
      toast.error(errMsg(e, 'Không cập nhật được sự cố'));
    }
  }

  return (
    <div className={`rounded-xl border bg-white p-3 ${isOpen ? 'border-rose-200' : 'border-neutral-200 opacity-80'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-neutral-900">{r.reasonLabel}</p>
          <p className="text-[11px] text-neutral-500">
            {INCIDENT_CONTEXT_LABEL[r.context]} · {r.reporterName}
            {r.reporterPhone && (
              <>
                {' · '}
                <a href={`tel:${r.reporterPhone}`} className="font-bold text-emerald-700 hover:underline">
                  {r.reporterPhone}
                </a>
              </>
            )}
            {' · '}
            {new Date(r.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            blocking
              ? 'bg-rose-600 text-white'
              : isOpen
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {blocking ? 'Cần đổi shipper' : isOpen ? 'Chưa xử lý' : r.actionTaken === 'reassigned' ? 'Đã đổi người' : 'Đã xử lý'}
        </span>
      </div>
      <p className={`mt-1 text-[11px] font-semibold ${r.canContinue ? 'text-emerald-700' : 'text-rose-700'}`}>
        {r.canContinue
          ? `Shipper vẫn tiếp tục${r.delayMinutes ? ` — dự kiến trễ khoảng ${r.delayMinutes} phút` : ''}.`
          : 'Shipper không thể tiếp tục — việc đã trở về chờ phân công.'}
      </p>
      {r.detail && <p className="mt-1.5 text-xs text-neutral-700">{r.detail}</p>}
      {r.photoUrl && (
        <a href={mediaUrl(r.photoUrl)} target="_blank" rel="noreferrer" className="mt-2 block h-20 w-20 overflow-hidden rounded-lg border border-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(r.photoUrl)} alt="Ảnh sự cố" className="h-full w-full object-cover" />
        </a>
      )}
      {!isOpen && r.resolvedNote && (
        <p className="mt-1.5 text-[11px] text-emerald-700">Cách xử lý: {r.resolvedNote}</p>
      )}
      {blocking && (
        <div className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 p-2.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-800">Đổi shipper khác</p>
          {candidates.length === 0 ? (
            <p className="text-[11px] text-neutral-600">
              Chưa có TNV giao hàng &amp; phục vụ nào khác đã duyệt — mời thêm người ở tab Đăng ký / Lịch làm việc.
            </p>
          ) : (
            <div className="space-y-1">
              {candidates.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={!!picked[c.id]}
                    onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="font-bold text-neutral-800">{c.label}</span>
                  {c.sub && <span className="truncate text-[11px] text-neutral-500">{c.sub}</span>}
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={submitReassign}
            disabled={reassign.isPending || pickedIds.length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
            {reassign.isPending ? 'Đang đổi…' : 'Giao cho người đã chọn'}
          </button>
        </div>
      )}
      {isOpen &&
        (resolving ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={blocking ? 'Vì sao đóng mà không đổi người? (vd: đã huỷ đợt, tự xử lý)' : 'Đã xử lý thế nào?'}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={submit}
              disabled={resolve.isPending}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Xác nhận
            </button>
            <button type="button" onClick={() => setResolving(false)} className="shrink-0 text-xs font-bold text-neutral-500">
              Huỷ
            </button>
          </div>
        ) : blocking ? (
          // Sự cố shipper trả việc: đóng mà không đổi người sẽ bỏ việc đó KHÔNG ai làm —
          // để nút phụ, việc chính là "Đổi shipper" ở trên.
          <button
            type="button"
            onClick={() => setResolving(true)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-neutral-500 underline-offset-2 hover:underline"
            title="Việc vẫn chưa có người làm — chỉ đóng khi đã huỷ hoặc xử lý cách khác"
          >
            Đóng mà không đổi người
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setResolving(true)}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <span className="material-symbols-outlined text-[14px]">task_alt</span>
            Đánh dấu đã xử lý
          </button>
        ))}
    </div>
  );
}
