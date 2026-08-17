'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useManageContext } from '../../../_components/ManageShell';
import CreateDistributionModal from '../../../_components/CreateDistributionModal';
import CampaignPlaybook, {
  type CampaignPhaseKey,
} from '@/components/campaigns/CampaignPlaybook';

type FilterKey = 'all' | 'today' | 'pending' | 'done';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'pending', label: 'Đang chờ' },
  { key: 'done', label: 'Đã xong' },
];

export default function DistributionPage() {
  const { campaign: c } = useManageContext();

  // SHIPPER và PHỤC VỤ đã duyệt đều được phân công đi phát: đợt phát tại chỗ là việc
  // của phục vụ, chỉ cho shipper thì phục vụ không có việc nào. Đầu bếp không nằm ở đây
  // — họ phải ở bếp lo mẻ tiếp theo (backend áp cùng quy tắc).
  // Khử trùng theo volunteerId: một người nhận NHIỀU CA sẽ có nhiều bản ghi phân công,
  // để nguyên thì danh sách hiện trùng tên và React báo lỗi key trùng.
  const APPROVED = ['assigned', 'checked_in', 'in_progress', 'completed'];
  const DISTRIBUTOR_ROLES = ['shipper', 'waiter'];
  const approvedDistributors = [
    ...new Map(
      (c.participants ?? [])
        .filter((p) => DISTRIBUTOR_ROLES.includes(p.role) && APPROVED.includes(p.status))
        .map((p) => [
          p.volunteerId,
          { volunteerId: p.volunteerId, fullName: p.fullName, role: p.role },
        ]),
    ).values(),
  ];

  // Suất còn được ghi nhận = mục tiêu − (đã phát + đã thừa của các đợt trước).
  const distributed = (c.distributions ?? []).reduce(
    (sum, d) => sum + d.servingsServed + d.leftoverServings,
    0,
  );
  const remainingServings =
    c.expectedServings != null && c.expectedServings > 0
      ? Math.max(c.expectedServings - distributed, 0)
      : null;
  const [filter, setFilter] = useState<FilterKey>('all');
  const [createOpen, setCreateOpen] = useState(false);
  /** Đợt đang mở xem đủ danh sách điểm phát (chỉ một đợt tại một thời điểm). */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Phase highlight theo status.
  const playbookHighlight: CampaignPhaseKey | null =
    c.status === 'completed'
      ? 'report'
      : c.status === 'in_progress'
      ? 'distribute'
      : c.status === 'approved'
      ? 'recruit'
      : 'plan';

  const stats = {
    total: c.actualServings ?? c.distributionSummary?.servingsServed ?? 0,
    people: c.distributionSummary?.peopleServed ?? 0,
    target: c.expectedServings ?? 1000,
    pct: 0,
  };
  stats.pct = stats.target > 0 ? Math.min(100, Math.round((stats.total / stats.target) * 100)) : 0;

  const list = c.distributions ?? [];

  // Áp filter thật (đã có state từ trước nhưng chưa dùng — bây giờ dùng).
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const filteredList = useMemo(() => {
    if (filter === 'all') return list;
    if (filter === 'today') {
      return list.filter((d) => {
        const dt = new Date(d.distributedAt);
        dt.setHours(0, 0, 0, 0);
        return dt.getTime() === today.getTime();
      });
    }
    // Đã xong / đang chờ bám theo `completedAt` cho khớp cột trạng thái trong bảng.
    if (filter === 'done') {
      return list.filter((d) => d.completedAt != null);
    }
    // 'pending'
    return list.filter((d) => d.completedAt == null);
  }, [filter, list, today]);

  // Xuất CSV danh sách đợt phát (download file local — không cần backend).
  function exportCsv() {
    if (list.length === 0) {
      toast.info('Chưa có đợt phát nào để xuất.');
      return;
    }
    const rows = [
      ['Đợt', 'Thời gian', 'Số suất', 'Người nhận', 'Phụ trách', 'Còn dư'],
      ...list.map((d) => [
        d.roundLabel || `Đợt #${d.id.slice(0, 6)}`,
        new Date(d.distributedAt).toLocaleString('vi-VN'),
        String(d.servingsServed),
        String(d.peopleServed),
        d.servedBy,
        String(d.leftoverServings ?? 0),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `distribution-${c.id.slice(0, 8)}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất báo cáo CSV');
  }

  return (
    <>
    <div className="cm-manage-2col">
      <div className="cm-manage-2col-main space-y-4">
        {/* Gợi ý quy trình tổ chức — collapsible dropdown */}
        <section className="cm-manage-card">
          <CampaignPlaybook variant="inline" highlightKey={playbookHighlight} />
        </section>
        <section className="cm-manage-card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="cm-manage-card-title !mb-1">
                <span className="material-symbols-outlined">dashboard</span>
                Tổng quan điều phối
              </h2>
              <p className="cm-manage-card-sub !mt-0">
                Theo dõi các đợt phân phát suất ăn cho người nhận.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="cm-manage-cta-secondary inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Xuất báo cáo
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={!['in_progress', 'completed'].includes(c.status)}
                className="cm-manage-cta-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!['in_progress', 'completed'].includes(c.status) ? 'Chỉ ghi đợt khi chiến dịch đang diễn ra hoặc đã hoàn tất' : ''}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Tạo đợt mới
              </button>
            </div>
          </div>

          <div className="cm-dist-big-stats">
            <BigStat
              icon="inventory"
              value={stats.total.toLocaleString('vi-VN')}
              label="Tổng suất đã phát"
              gradient="from-emerald-500 to-emerald-700"
              iconBg="bg-emerald-100 text-emerald-700"
            />
            <BigStat
              icon="group"
              value={stats.people.toLocaleString('vi-VN')}
              label="Người được phục vụ"
              gradient="from-sky-500 to-sky-700"
              iconBg="bg-sky-100 text-sky-700"
            />
            <BigStat
              icon="percent"
              value={`${stats.pct}%`}
              label="Hoàn thành mục tiêu"
              gradient="from-amber-500 to-amber-700"
              iconBg="bg-amber-100 text-amber-700"
            />
          </div>
        </section>

        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <h2 className="cm-manage-card-title !mb-1">
                <span className="material-symbols-outlined">restaurant</span>
                Danh sách các đợt phát
              </h2>
              <span className="text-xs font-bold text-neutral-500">
                {filteredList.length}/{list.length} đợt
              </span>
            </div>
            <p className="cm-manage-card-sub !mt-0 mb-3">
              Bấm vào từng đợt để xem chi tiết và phản hồi.
            </p>
            <div className="cm-mini-tabs">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`cm-mini-tab ${filter === f.key ? '!bg-[#236c2a] !text-white !border-[#236c2a] ' : ''}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredList.length === 0 ? (
            <div className="cm-mini-empty pb-6">
              <span className="material-symbols-outlined">takeout_dining</span>
              {list.length === 0
                ? 'Chưa có đợt phân phát nào — bấm "Tạo đợt mới" để bắt đầu.'
                : 'Không có đợt phát nào khớp với bộ lọc hiện tại.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="cm-dist-table">
                <thead>
                  <tr>
                    <th>Đợt</th>
                    <th>Thời gian</th>
                    <th>Số suất</th>
                    <th>Người nhận</th>
                    <th>Phụ trách</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((d) => {
                    // Trạng thái theo `completedAt` — trước đây suy từ "có feedback chưa",
                    // nên đợt phát xong mà chưa ai góp ý vẫn bị coi là đang chờ.
                    const distStatus = d.completedAt ? 'done' : 'pending';
                    const initials = d.servedBy.split(' ').map((w: string) => w.charAt(0)).slice(0, 2).join('').toUpperCase();
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="cm-dist-table-icon">
                              <span className="material-symbols-outlined text-[16px]">takeout_dining</span>
                            </span>
                            <p className="cm-dist-table-name">{d.roundLabel || `Đợt #${d.id.slice(0, 6)}`}</p>
                          </div>
                          {/* Điểm phát — mặc định thu gọn 1 dòng, bấm mới xem đủ địa chỉ.
                              Địa chỉ Nominatim rất dài, để nguyên thì cột phình ra
                              đẩy hỏng cả bảng. */}
                          {d.points?.length > 0 && (
                            <div className="mt-1.5 pl-7">
                              <button
                                type="button"
                                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                                aria-expanded={expandedId === d.id}
                                className="inline-flex max-w-full items-center gap-1 rounded-md text-[11px] text-emerald-700 hover:text-emerald-800"
                              >
                                <span className="material-symbols-outlined text-[13px]">place</span>
                                <span className="font-semibold">
                                  {d.points.length} điểm phát
                                </span>
                                <span
                                  className={`material-symbols-outlined text-[13px] transition-transform ${
                                    expandedId === d.id ? 'rotate-180' : ''
                                  }`}
                                >
                                  expand_more
                                </span>
                              </button>
                              {expandedId === d.id && (
                                <ul className="mt-1 space-y-1">
                                  {d.points.map((pt, i) => (
                                    <li
                                      key={`${d.id}-pt-${i}`}
                                      className="text-[11px] leading-snug text-neutral-500"
                                    >
                                      <span className="font-semibold text-neutral-700">
                                        {i + 1}. {pt.label}
                                      </span>
                                      <br />
                                      {pt.address}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <p className="cm-dist-table-time">
                            {new Date(d.distributedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="cm-dist-table-date">
                            {new Date(d.distributedAt).toLocaleDateString('vi-VN')}
                          </p>
                        </td>
                        <td className="font-extrabold">{d.servingsServed}</td>
                        <td>{d.peopleServed}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="cm-dist-table-avatar">{initials}</span>
                            <span className="text-xs font-bold text-neutral-700">{d.servedBy}</span>
                          </div>
                          {/* Đợt phân công nhiều shipper: liệt kê những người còn lại */}
                          {d.assignees?.length > 1 && (
                            <p className="mt-1 pl-8 text-[11px] text-neutral-500">
                              + {d.assignees.length - 1} shipper khác:{' '}
                              {d.assignees.slice(1).map((a) => a.fullName).join(', ')}
                            </p>
                          )}
                        </td>
                        <td>
                          {/* whitespace-nowrap: chip 2 chữ "Đang chờ" bị ngắt dòng làm
                              lệch chiều cao cả hàng. */}
                          <span className={`cm-dist-status whitespace-nowrap ${distStatus === 'done' ? 'cm-dist-status--done' : 'cm-dist-status--pending'}`}>
                            {distStatus === 'done' ? 'Đã xong' : 'Đang chờ'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => toast(d.note ? d.note : 'Chưa có ghi chú cho đợt này.')}
                            className="cm-dist-row-action"
                            aria-label="Xem chi tiết đợt phát"
                            title="Xem ghi chú đợt phát"
                          >
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="cm-manage-2col-side space-y-4">
        <section className="cm-manage-card">
          <h3 className="cm-manage-card-title">
            <span className="material-symbols-outlined">map</span>
            Mật độ phân bố
          </h3>
          {c.distributions && c.distributions.length > 0 ? (
            <div className="cm-mini-map mt-3">
              <div className="cm-mini-map-bg" />
              {c.distributions.slice(0, 4).map((d, idx) => {
                const positions = [
                  { top: '20%', left: '40%' },
                  { top: '50%', left: '70%' },
                  { top: '70%', left: '30%' },
                  { top: '35%', left: '20%' },
                ];
                const pos = positions[idx];
                const isLarge = d.servingsServed >= 250;
                return (
                  <span
                    key={d.id}
                    className={`cm-mini-map-pin ${isLarge ? 'cm-mini-map-pin--lg' : idx === 1 ? 'cm-mini-map-pin--md' : ''}`}
                    style={{ top: pos.top, left: pos.left }}
                    title={`${d.roundLabel || 'Đợt'} — ${d.servingsServed} suất`}
                  >
                    <span className="material-symbols-outlined text-[14px]">restaurant</span>
                  </span>
                );
              })}
              <div className="cm-mini-map-legend">
                <p className="text-[10px] font-bold text-neutral-500">
                  <span className="cm-mini-map-dot cm-mini-map-dot--lg" /> 250+ suất
                </p>
                <p className="text-[10px] font-bold text-neutral-500">
                  <span className="cm-mini-map-dot" /> {'<250'} suất
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400 mt-2">Chưa có đợt phát để hiển thị bản đồ.</p>
          )}
        </section>

        <section className="cm-manage-card">
          <h3 className="cm-manage-card-title">
            <span className="material-symbols-outlined">sticky_note_2</span>
            Ghi chú vận hành
          </h3>
          {c.distributions && c.distributions.length > 0 ? (
            <ul className="cm-notes-list">
              {c.distributions
                .filter((d) => d.note && d.note.trim().length > 0)
                .slice(0, 6)
                .map((d, idx) => {
                  const tone = (['emerald', 'honey', 'sky', 'rose'] as const)[idx % 4];
                  return (
                    <li key={d.id} className="cm-notes-item">
                      <span className={`cm-notes-bullet cm-notes-bullet--${tone}`} />
                      <span>
                        <b>{d.roundLabel || `Đợt #${idx + 1}`}:</b> {d.note}
                      </span>
                    </li>
                  );
                })}
              {c.distributions.filter((d) => d.note && d.note.trim().length > 0).length === 0 && (
                <li className="cm-notes-item">
                  <span className="cm-notes-bullet cm-notes-bullet--emerald" />
                  <span>Chưa có ghi chú vận hành nào được thêm vào.</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-neutral-400 mt-2">Chưa có ghi chú vận hành.</p>
          )}
        </section>
      </aside>
    </div>

      {createOpen && (
        <CreateDistributionModal
          campaignId={c.id}
          onClose={() => setCreateOpen(false)}
          volunteers={approvedDistributors}
          remainingServings={remainingServings}
          kitchenCoords={
            c.kitchenLng != null && c.kitchenLat != null
              ? { lng: c.kitchenLng, lat: c.kitchenLat }
              : null
          }
        />
      )}
    </>
  );
}

function BigStat({
  icon, value, label, gradient, iconBg,
}: {
  icon: string; value: string; label: string; gradient: string; iconBg: string;
}) {
  return (
    <div className={`cm-dist-big-stat bg-gradient-to-br ${gradient}`}>
      <span className={`cm-dist-big-stat-icon ${iconBg}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <p className="cm-dist-big-stat-value">{value}</p>
      <p className="cm-dist-big-stat-label">{label}</p>
    </div>
  );
}
