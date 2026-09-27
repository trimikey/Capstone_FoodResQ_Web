'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useCampaignIncidents,
  useResolveCampaignIncident,
  type CampaignIncident,
  type IncidentContext,
} from '@/hooks/useCampaigns';
import { INCIDENT_CONTEXT_LABEL } from '@/lib/campaign-incidents';
import { errMsg, mediaUrl } from '@/lib/utils';

/**
 * Sự cố shipper báo trong chiến dịch — cho TỔ CHỨC xem và đánh dấu đã xử lý.
 * `context` lọc theo trang (Giao & nhận hàng = pickup, Phân phối = distribution).
 */
export default function CampaignIncidentsPanel({
  campaignId,
  context,
}: {
  campaignId: string;
  context?: IncidentContext;
}) {
  const { data, isLoading } = useCampaignIncidents(campaignId);
  const rows = (data ?? []).filter((r) => !context || r.context === context);
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
          <IncidentRow key={r.id} incident={r} campaignId={campaignId} />
        ))}
      </div>
    </section>
  );
}

function IncidentRow({ incident: r, campaignId }: { incident: CampaignIncident; campaignId: string }) {
  const resolve = useResolveCampaignIncident();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const isOpen = r.status === 'open';

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
            isOpen ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {isOpen ? 'Chưa xử lý' : 'Đã xử lý'}
        </span>
      </div>
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
      {isOpen &&
        (resolving ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Đã xử lý thế nào? (vd: đổi shipper khác đi lấy)"
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
