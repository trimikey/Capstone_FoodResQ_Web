'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { reverseGeocode } from '@/lib/geocode';
import {
  useCreateDistribution,
  type CreateDistributionInput,
  type DistributionPoint,
} from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

interface Props {
  campaignId: string;
  onClose: () => void;
  onCreated?: () => void;
  /**
   * TNV đã duyệt của chiến dịch có thể đi phát — shipper (đi điểm xa) và phục vụ
   * (phát tại chỗ). BE áp cùng quy tắc cho `assigneeVolunteerIds`; đầu bếp không
   * thuộc danh sách này vì họ phải ở bếp.
   */
  volunteers: Array<{
    volunteerId: string;
    fullName: string;
    role: string;
    /**
     * Các ca trực TNV đã đăng ký (campaign_shifts). Một người có thể nhận nhiều ca —
     * thời gian phân phát phải rơi vào MỘT trong các ca này. Rỗng = chưa đăng ký ca nào.
     */
    shifts?: Array<{ label: string; start: string; end: string }>;
  }>;
  /** Số suất còn được ghi nhận = mục tiêu − (đã phát + đã thừa). null = chưa đặt mục tiêu. */
  remainingServings: number | null;
  /** Toạ độ bếp — mốc mở bản đồ khi ghim điểm phát. Null thì rơi về trung tâm TP.HCM. */
  kitchenCoords?: { lng: number; lat: number } | null;
}

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-neutral-100" />,
});

type PointRow = { label: string; address: string; lng?: number; lat?: number };
const EMPTY_POINT: PointRow = { label: '', address: '' };

/** Trung tâm TP.HCM — mốc mở bản đồ khi chiến dịch chưa ghim toạ độ bếp (CLAUDE.md §3.5). */
const HCM_CENTER = { lng: 106.6297, lat: 10.8231 };

/** Phải khớp `MIN_POINT_DISTANCE_M` ở BE — BE mới là nơi chốt chặn, đây chỉ báo sớm. */
const MIN_POINT_DISTANCE_M = 500;

/** Khoảng cách hai toạ độ (mét) — haversine, giống công thức BE dùng. */
function distanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cặp điểm đầu tiên vi phạm khoảng cách tối thiểu; null nếu mọi cặp đều hợp lệ. */
function findTooClosePair(
  points: Array<{ label: string; lng?: number; lat?: number }>,
): { i: number; j: number; distance: number } | null {
  const pinned = points
    .map((p, idx) => ({ ...p, idx }))
    .filter((p): p is { label: string; lng: number; lat: number; idx: number } =>
      typeof p.lng === 'number' && typeof p.lat === 'number');
  for (let i = 0; i < pinned.length; i += 1) {
    for (let j = i + 1; j < pinned.length; j += 1) {
      const d = distanceMeters(pinned[i], pinned[j]);
      if (d < MIN_POINT_DISTANCE_M) {
        return { i: pinned[i].idx, j: pinned[j].idx, distance: d };
      }
    }
  }
  return null;
}

/** So sánh thời gian HH:mm — t nằm trong [start, end] (bao gồm cả hai đầu). */
function timeInWindow(t: string, start: string, end: string): boolean {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const tv = toMin(t);
  const sv = toMin(start);
  const ev = toMin(end);
  if (!Number.isFinite(tv) || !Number.isFinite(sv) || !Number.isFinite(ev)) return true;
  // Ca qua đêm (vd 22:00–02:00): chia thành hai đoạn [sv, 24:00) và [00:00, ev].
  if (sv <= ev) return tv >= sv && tv <= ev;
  return tv >= sv || tv <= ev;
}

export default function CreateDistributionModal({
  campaignId,
  onClose,
  onCreated,
  volunteers,
  remainingServings,
  kitchenCoords,
}: Props) {
  const create = useCreateDistribution();
  const [assignees, setAssignees] = useState<string[]>([]);
  const [points, setPoints] = useState<PointRow[]>([{ ...EMPTY_POINT }]);
  /** Chỉ mở bản đồ của MỘT điểm tại một thời điểm — nhiều bản đồ Leaflet cùng lúc rất nặng. */
  const [mapOpenIndex, setMapOpenIndex] = useState<number | null>(null);
  const [roundLabel, setRoundLabel] = useState('');
  const [servings, setServings] = useState<string>('');
  const [distributionTime, setDistributionTime] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setErr = (k: string, v: string | undefined) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });
  };

  function validate(): CreateDistributionInput | null {
    const next: Record<string, string> = {};
    const s = Number(servings);
    if (!servings.trim() || !Number.isFinite(s) || s < 1 || !Number.isInteger(s)) {
      next.servings = 'Vui lòng nhập số nguyên ≥ 1';
    }
    // Không vượt số suất chiến dịch còn lại để phân phát.
    if (!next.servings && remainingServings != null && s > remainingServings) {
      next.servings = `Chỉ còn ${remainingServings} suất để phân phát`;
    }
    if (assignees.length === 0) {
      next.assignees = 'Chọn ít nhất một người phụ trách đi phát';
    }
    if (!distributionTime.trim()) {
      next.distributionTime = 'Vui lòng chọn thời gian phân phát';
    } else if (assignees.length > 0) {
      // Thời gian phân phát phải nằm TRONG ca trực của ÍT NHẤT một người được chọn —
      // không thì shipper nhận lệnh lúc họ đang ngoài ca, dẫn tới trễ hoặc bỏ đơn.
      const outside = assignees.filter((id) => {
        const v = volunteers.find((x) => x.volunteerId === id);
        const shifts = v?.shifts ?? [];
        // TNV chưa đăng ký ca nào thì không ràng buộc (ca cũ đã bị xoá hoặc dữ liệu thiếu).
        if (shifts.length === 0) return false;
        return !shifts.some((sh) => timeInWindow(distributionTime, sh.start, sh.end));
      });
      if (outside.length > 0) {
        const names = outside.map((id) => volunteers.find((v) => v.volunteerId === id)?.fullName || id);
        next.distributionTime = `Thời gian này ngoài ca trực của: ${names.join(', ')}`;
      }
    }
    if (roundLabel.trim().length > 100) {
      next.roundLabel = 'Tên đợt tối đa 100 ký tự';
    }
    if (note.trim().length > 500) {
      next.note = 'Ghi chú tối đa 500 ký tự';
    }

    // Điểm phát: bỏ qua dòng để trống hoàn toàn; dòng nhập nửa vời thì báo lỗi
    // thay vì âm thầm bỏ — nếu không TNV sẽ mất một điểm mà không ai biết.
    const cleanPoints: DistributionPoint[] = [];
    points.forEach((pt, i) => {
      const label = pt.label.trim();
      const address = pt.address.trim();
      if (!label && !address) return;
      if (!label || !address) {
        next[`point-${i}`] = 'Cần cả tên điểm và địa chỉ';
        return;
      }
      // lng/lat chỉ gửi khi có ĐỦ cặp — thiếu một nửa thì toạ độ vô nghĩa, BE cũng bỏ.
      cleanPoints.push({
        label,
        address,
        ...(pt.lng != null && pt.lat != null ? { lng: pt.lng, lat: pt.lat } : {}),
      });
    });

    // Hai điểm quá gần nhau thì phục vụ trùng một nhóm dân cư — BE cũng chặn lại.
    const tooClose = findTooClosePair(points);
    if (tooClose) {
      next[`point-${tooClose.j}`] =
        `Cách điểm ${tooClose.i + 1} chỉ ${Math.round(tooClose.distance)} m (tối thiểu ${MIN_POINT_DISTANCE_M} m)`;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    const timeNote = `Thời gian phân phát: ${distributionTime}`;
    const mergedNote = [timeNote, note.trim()].filter(Boolean).join(' • ');

    return {
      // Người đầu tiên trong danh sách đứng tên chính cho đợt phát.
      servedByVolunteerId: assignees[0],
      assigneeVolunteerIds: assignees,
      points: cleanPoints.length > 0 ? cleanPoints : undefined,
      servingsServed: s,
      peopleServed: s,
      leftoverServings: 0,
      roundLabel: roundLabel.trim() || undefined,
      note: mergedNote || undefined,
    };
  }

  function toggleAssignee(id: string) {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (errors.assignees) setErr('assignees', undefined);
    // Đổi người phụ trách làm thay đổi ca trực ràng buộc giờ phát → xoá lỗi cũ.
    if (errors.distributionTime) setErr('distributionTime', undefined);
  }

  function patchPoint(i: number, patch: Partial<PointRow>) {
    setPoints((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    if (errors[`point-${i}`]) setErr(`point-${i}`, undefined);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = validate();
    if (!payload) return;
    try {
      await create.mutateAsync({ campaignId, input: payload });
      toast.success('Đã gửi yêu cầu phân phát');
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Gửi yêu cầu phân phát thất bại'));
    }
  }

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-3xl max-h-[92vh] elevation-3 overflow-hidden flex flex-col"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white shrink-0">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined">takeout_dining</span>
          Đưa yêu cầu phân phát
        </h3>
        <p className="text-xs text-white/80 mt-1">Chọn người phụ trách và số suất cần phân phát</p>
      </div>

      {/* Bố cục 2 cột: trái = ai đi phát & phát ở đâu, phải = số liệu ghi nhận.
          Form dọc một cột trước đây dài quá màn hình, phải cuộn mới thấy nút lưu. */}
      <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
        {/* Người phụ trách — chọn được nhiều người. BE kiểm lại từng người phải là
            TNV đã duyệt của chiến dịch VÀ có vai trò shipper hoặc phục vụ, rồi gửi
            thông báo cho tất cả để họ đi phát. */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
            Người phụ trách đi phát <span className="text-rose-500">*</span>
          </p>
          {volunteers.length === 0 ? (
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800">
              Chiến dịch chưa duyệt TNV giao hàng hoặc phục vụ nào — hãy duyệt ít nhất
              1 đăng ký thuộc hai vai trò này trước khi phân công đi phát.
            </p>
          ) : (
            <>
              <div
                className={`max-h-56 overflow-y-auto rounded-xl border divide-y divide-neutral-100 ${
                  errors.assignees ? 'border-rose-500 ring-1 ring-rose-200' : 'border-neutral-200'
                }`}
              >
                {volunteers.map((v) => {
                  const checked = assignees.includes(v.volunteerId);
                  return (
                    <label
                      key={v.volunteerId}
                      className={`flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors ${
                        checked ? 'bg-emerald-50' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignee(v.volunteerId)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                      />
                      {/* 2 dòng: tên đầy đủ + vai trò, bên dưới liệt kê chi tiết từng ca.
                          Bố cục 1 hàng trước đây để pill ca chiếm hết ngang, tên bị
                          truncate còn "S..". */}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-neutral-800">{v.fullName}</span>
                          {/* Nhãn vai trò: phân biệt ai đi điểm xa (shipper) và ai phát tại chỗ (phục vụ). */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              v.role === 'waiter'
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-teal-100 text-teal-700'
                            }`}
                          >
                            {v.role === 'waiter' ? 'Phục vụ' : 'Giao hàng'}
                          </span>
                        </span>
                        {/* Ca trực — tổ chức cần biết giờ TNV làm việc để chọn giờ phát khớp ca. */}
                        {v.shifts && v.shifts.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {v.shifts.map((s, i) => (
                              <span
                                key={`${s.label}-${s.start}-${i}`}
                                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600"
                              >
                                <span className="material-symbols-outlined text-[11px]">schedule</span>
                                {s.label} · {s.start}–{s.end}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] font-medium text-neutral-400">
                {assignees.length > 0
                  ? `Đã chọn ${assignees.length} người — tất cả sẽ nhận thông báo đi giao.`
                  : 'Chọn một hoặc nhiều TNV giao hàng / phục vụ.'}
              </p>
            </>
          )}
          {errors.assignees && (
            <p className="text-[11px] font-semibold text-rose-600">{errors.assignees}</p>
          )}
        </div>

        {/* Điểm phát — địa chỉ để shipper điều hướng tới */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
              Điểm phát &amp; địa chỉ
            </p>
            <button
              type="button"
              onClick={() => setPoints((prev) => [...prev, { ...EMPTY_POINT }])}
              disabled={points.length >= 20}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Thêm điểm
            </button>
          </div>
          <div className="space-y-2">
            {points.map((pt, i) => {
              const mapOpen = mapOpenIndex === i;
              const center = pt.lng != null && pt.lat != null
                ? { lng: pt.lng, lat: pt.lat }
                : kitchenCoords ?? HCM_CENTER;
              return (
                <div key={i} className="rounded-xl border border-neutral-200 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-500">
                      {i + 1}
                    </span>
                    <input
                      value={pt.label}
                      onChange={(e) => patchPoint(i, { label: e.target.value })}
                      placeholder="Tên điểm — VD: Cổng trường tiểu học A"
                      maxLength={255}
                      className="input-base !py-2 flex-1"
                    />
                    {points.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPoints((prev) => prev.filter((_, idx) => idx !== i));
                          setMapOpenIndex(null);
                        }}
                        className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Xoá điểm ${i + 1}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      value={pt.address}
                      onChange={(e) => patchPoint(i, { address: e.target.value })}
                      placeholder="Địa chỉ đầy đủ để shipper tìm đường"
                      maxLength={500}
                      className={`input-base !py-2 flex-1 ${
                        errors[`point-${i}`] ? '!border-rose-500 !ring-1 !ring-rose-200' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setMapOpenIndex(mapOpen ? null : i)}
                      className={`shrink-0 rounded-lg border px-2.5 py-2 transition-colors ${
                        mapOpen
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                      }`}
                      title={mapOpen ? 'Đóng bản đồ' : 'Chọn vị trí trên bản đồ'}
                      aria-label={`Chọn vị trí điểm ${i + 1} trên bản đồ`}
                    >
                      <span className="material-symbols-outlined text-[18px]">map</span>
                    </button>
                  </div>

                  {mapOpen && (
                    <>
                      <div className="h-44 overflow-hidden rounded-xl border border-neutral-200">
                        {/* Bấm/kéo ghim → LocationPicker tự reverse-geocode và điền địa chỉ.
                            Gõ địa chỉ tay cũng được: nó geocode ngược lại để dời ghim. */}
                        <LocationPicker
                          lng={center.lng}
                          lat={center.lat}
                          address={pt.address || undefined}
                          onPick={(lng, lat, addr) => {
                            patchPoint(i, {
                              lng,
                              lat,
                              ...(addr ? { address: addr } : {}),
                            });
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-neutral-500">
                          {pt.lng != null && pt.lat != null
                            ? `Đã ghim: ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`
                            : 'Bấm lên bản đồ để ghim vị trí chính xác.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (!navigator.geolocation) {
                              toast.error('Trình duyệt không hỗ trợ định vị.');
                              return;
                            }
                            navigator.geolocation.getCurrentPosition(
                              async (pos) => {
                                const lng = pos.coords.longitude;
                                const lat = pos.coords.latitude;
                                const addr = await reverseGeocode(lat, lng);
                                patchPoint(i, { lng, lat, ...(addr ? { address: addr } : {}) });
                              },
                              () => toast.error('Không lấy được vị trí hiện tại.'),
                              { enableHighAccuracy: true, timeout: 10_000 },
                            );
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          <span className="material-symbols-outlined text-[14px]">my_location</span>
                          Vị trí của tôi
                        </button>
                      </div>
                    </>
                  )}

                  {errors[`point-${i}`] && (
                    <p className="text-[11px] font-semibold text-rose-600">{errors[`point-${i}`]}</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] font-medium text-neutral-400">
            Để trống nếu chưa chốt điểm — shipper sẽ được nhắc liên hệ tổ chức để nhận địa chỉ.
            Các điểm đã ghim phải cách nhau ít nhất {MIN_POINT_DISTANCE_M} m.
          </p>
        </div>
        </div>

        {/* ── Cột phải: số liệu ghi nhận ── */}
        <div className="space-y-4">
        {remainingServings != null && (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <span className="material-symbols-outlined text-[14px]">inventory</span>
            Còn {remainingServings} suất có thể đưa đi phân phát.
          </p>
        )}

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Tên đợt (tuỳ chọn)
          <input
            value={roundLabel}
            onChange={(e) => {
              setRoundLabel(e.target.value);
              if (errors.roundLabel) setErr('roundLabel', undefined);
            }}
            placeholder="VD: Đợt 1 — trưa nay"
            maxLength={100}
            className={`input-base ${errors.roundLabel ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.roundLabel && <p className="text-[11px] text-rose-600 font-semibold">{errors.roundLabel}</p>}
        </label>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Thời gian phân phát <span className="text-rose-500">*</span>
          <input
            type="time"
            value={distributionTime}
            onChange={(e) => {
              setDistributionTime(e.target.value);
              if (errors.distributionTime) setErr('distributionTime', undefined);
            }}
            className={`input-base ${errors.distributionTime ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.distributionTime && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {errors.distributionTime}
            </p>
          )}
        </label>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Số suất cần phân phát <span className="text-rose-500">*</span>
          <input
            type="number"
            min={0}
            value={servings}
            onChange={(e) => {
              setServings(e.target.value);
              if (errors.servings) setErr('servings', undefined);
            }}
            placeholder="VD: 150"
            className={`input-base ${errors.servings ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.servings && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {errors.servings}
            </p>
          )}
        </label>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Ghi chú (tuỳ chọn)
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (errors.note) setErr('note', undefined);
            }}
            maxLength={500}
            rows={2}
            placeholder="VD: Phát tại cổng trường tiểu học A"
            className={`input-base ${errors.note ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.note && <p className="text-[11px] text-rose-600 font-semibold">{errors.note}</p>}
        </label>
        </div>
        </div>

        <div className="mt-5 flex gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-bold text-sm rounded-xl"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="flex-1 py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {create.isPending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Đang gửi...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">check</span>
                Gửi yêu cầu phân phát
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
