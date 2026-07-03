'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { AssignmentRole, SafetyCheckResult, SafetyCheckType, UserRole } from '@foodresq/types';
import { useMe } from '@/hooks/useProfile';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useRecipes } from '@/hooks/useRecipes';
import {
  useShifts, useCreateShift, useApplyShift,
  useMenuItems, useAddMenuItem, useRemoveMenuItem,
  useSafetyLogs, useCreateSafetyLog,
  useDistributions, useDistributionSummary, useCreateDistribution, useAddFeedback,
} from '@/hooks/useKitchenOps';
import { mediaUrl, formatDate } from '@/lib/utils';

function errMsg(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

const ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };
const CHECK_TYPE: { value: SafetyCheckType; label: string }[] = [
  { value: SafetyCheckType.TEMPERATURE, label: 'Nhiệt độ' },
  { value: SafetyCheckType.HYGIENE, label: 'Vệ sinh' },
  { value: SafetyCheckType.STORAGE, label: 'Bảo quản' },
  { value: SafetyCheckType.CROSS_CONTAMINATION, label: 'Nhiễm chéo' },
  { value: SafetyCheckType.HANDWASHING, label: 'Rửa tay' },
  { value: SafetyCheckType.OTHER, label: 'Khác' },
];
const CHECK_TYPE_LABEL = Object.fromEntries(CHECK_TYPE.map((c) => [c.value, c.label]));
const RESULT_META: Record<SafetyCheckResult, { label: string; badge: string }> = {
  [SafetyCheckResult.PASS]: { label: 'Đạt', badge: 'badge-emerald' },
  [SafetyCheckResult.WARNING]: { label: 'Cảnh báo', badge: 'badge-honey' },
  [SafetyCheckResult.FAIL]: { label: 'Không đạt', badge: 'badge-rose' },
};

type Tab = 'menu' | 'shifts' | 'safety' | 'dist';

export default function KitchenManagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: vol } = useVolunteerMe(me?.role === UserRole.VOLUNTEER);

  const isCharity = me?.role === UserRole.RECEIVER;
  const specs = (vol?.specializations ?? []).map((s) => s.specialization);
  const isChef = specs.includes('chef');
  const isWaiter = specs.includes('waiter');

  const [tab, setTab] = useState<Tab>('menu');
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'menu', label: 'Thực đơn', icon: 'restaurant_menu' },
    { key: 'shifts', label: 'Ca làm việc', icon: 'schedule' },
    { key: 'safety', label: 'An toàn TP', icon: 'health_and_safety' },
    { key: 'dist', label: 'Phân phát', icon: 'volunteer_activism' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-5">
      <Link href="/campaigns" className="text-sm text-neutral-500 flex items-center gap-1 mb-3">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> Về danh sách chiến dịch
      </Link>
      <h1 className="text-2xl font-extrabold text-neutral-800 flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-honey-600">soup_kitchen</span> Quản lý bếp ăn
      </h1>

      <div className="flex gap-1 bg-neutral-100 rounded-2xl p-1 mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-[88px] py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-0.5 transition-colors ${
              tab === t.key ? 'bg-white text-honey-700 shadow-sm' : 'text-neutral-500'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'menu' && <MenuTab campaignId={id} canManage={isCharity} />}
      {tab === 'shifts' && <ShiftsTab campaignId={id} canManage={isCharity} canApply={!!vol} />}
      {tab === 'safety' && <SafetyTab campaignId={id} canAdd={isChef} />}
      {tab === 'dist' && <DistTab campaignId={id} canAdd={isWaiter} />}
    </div>
  );
}

// ── Tab: Thực đơn ───────────────────────────────────────────────────────────────
function MenuTab({ campaignId, canManage }: { campaignId: string; canManage: boolean }) {
  const { data: items, isLoading } = useMenuItems(campaignId);
  const add = useAddMenuItem();
  const remove = useRemoveMenuItem();

  const [mode, setMode] = useState<'recipe' | 'custom'>('recipe');
  const [search, setSearch] = useState('');
  const [pickedRecipe, setPickedRecipe] = useState<{ id: string; name: string } | null>(null);
  const [customName, setCustomName] = useState('');
  const [planned, setPlanned] = useState('');
  const { data: recipeResult } = useRecipes(search);

  async function doAdd() {
    try {
      if (mode === 'recipe') {
        if (!pickedRecipe) { toast.error('Hãy chọn một công thức.'); return; }
        await add.mutateAsync({ campaignId, recipeId: pickedRecipe.id, plannedServings: planned ? Number(planned) : undefined });
      } else {
        if (customName.trim().length < 1) { toast.error('Nhập tên món.'); return; }
        await add.mutateAsync({ campaignId, customName: customName.trim(), plannedServings: planned ? Number(planned) : undefined });
      }
      toast.success('Đã thêm vào thực đơn.');
      setPickedRecipe(null); setCustomName(''); setPlanned(''); setSearch('');
    } catch (e) { toast.error(errMsg(e, 'Thêm thất bại')); }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="bg-white rounded-2xl border border-neutral-150 p-4">
          <div className="flex gap-2 mb-3">
            <button onClick={() => setMode('recipe')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${mode === 'recipe' ? 'bg-honey-500 text-white' : 'bg-neutral-100 text-neutral-600'}`}>Từ công thức</button>
            <button onClick={() => setMode('custom')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${mode === 'custom' ? 'bg-honey-500 text-white' : 'bg-neutral-100 text-neutral-600'}`}>Món tự do</button>
          </div>

          {mode === 'recipe' ? (
            pickedRecipe ? (
              <div className="flex items-center gap-2 mb-2 bg-honey-50 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-[18px] text-honey-600">menu_book</span>
                <span className="text-sm font-semibold text-neutral-700 flex-1">{pickedRecipe.name}</span>
                <button onClick={() => setPickedRecipe(null)} className="text-neutral-400"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ) : (
              <div className="mb-2">
                <input className="input-base !py-1.5 text-sm" placeholder="Tìm công thức…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {search && (recipeResult?.items.length ?? 0) > 0 && (
                  <div className="mt-1 border border-neutral-150 rounded-lg max-h-40 overflow-y-auto">
                    {recipeResult!.items.map((r) => (
                      <button key={r.id} onClick={() => { setPickedRecipe({ id: r.id, name: r.name }); setSearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-neutral-300">skillet</span>{r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            <input className="input-base !py-1.5 text-sm mb-2" placeholder="Tên món tự do" value={customName} onChange={(e) => setCustomName(e.target.value)} />
          )}

          <div className="flex gap-2">
            <input type="number" min={0} className="input-base !py-1.5 text-sm w-32" placeholder="Số suất" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            <button onClick={doAdd} disabled={add.isPending} className="flex-1 py-2 bg-brand-gradient text-white rounded-xl text-sm font-bold disabled:opacity-50">Thêm vào thực đơn</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-center text-neutral-400 py-6">Đang tải…</p> : (items ?? []).length === 0 ? (
        <p className="text-center text-neutral-400 py-8">Chưa có món nào trong thực đơn.</p>
      ) : (
        <ul className="bg-white rounded-2xl border border-neutral-150 divide-y divide-neutral-100">
          {items!.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3">
              <span className="material-symbols-outlined text-[20px] text-honey-500">{it.recipeId ? 'menu_book' : 'lunch_dining'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-800 truncate">{it.recipe?.name ?? it.customName}</p>
                {it.plannedServings != null && <p className="text-[11px] text-neutral-400">Dự kiến {it.plannedServings} suất</p>}
              </div>
              {it.recipeId && <Link href={`/recipes/${it.recipeId}`} className="text-xs text-emerald-700 font-bold">Xem</Link>}
              {canManage && (
                <button onClick={() => remove.mutate({ campaignId, itemId: it.id })} className="text-neutral-300 hover:text-rose-500">
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Tab: Ca làm việc ───────────────────────────────────────────────────────────
function ShiftsTab({ campaignId, canManage, canApply }: { campaignId: string; canManage: boolean; canApply: boolean }) {
  const { data: shifts, isLoading } = useShifts(campaignId);
  const create = useCreateShift();
  const apply = useApplyShift();

  const [label, setLabel] = useState('');
  const [role, setRole] = useState<AssignmentRole | ''>('');
  const [startTime, setStart] = useState('');
  const [endTime, setEnd] = useState('');
  const [slots, setSlots] = useState('');

  async function doCreate() {
    if (label.trim().length < 2 || !startTime || !endTime || !slots) { toast.error('Điền đủ thông tin ca.'); return; }
    try {
      await create.mutateAsync({ campaignId, label: label.trim(), role: role || undefined, startTime, endTime, slotsNeeded: Number(slots) });
      toast.success('Đã tạo ca làm việc.');
      setLabel(''); setRole(''); setStart(''); setEnd(''); setSlots('');
    } catch (e) { toast.error(errMsg(e, 'Tạo ca thất bại')); }
  }

  async function doApply(shiftId: string, shiftRole: AssignmentRole | null) {
    try {
      await apply.mutateAsync({ campaignId, shiftId, role: shiftRole ?? undefined });
      toast.success('Đăng ký ca thành công.');
    } catch (e) { toast.error(errMsg(e, 'Đăng ký thất bại')); }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="bg-white rounded-2xl border border-neutral-150 p-4 space-y-2">
          <input className="input-base !py-1.5 text-sm" placeholder="Tên ca (VD: Ca sáng - Sơ chế)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className="flex gap-2">
            <select className="input-base !py-1.5 text-sm flex-1" value={role} onChange={(e) => setRole(e.target.value as AssignmentRole | '')}>
              <option value="">Vai trò: Chung</option>
              <option value="chef">Đầu bếp</option>
              <option value="waiter">Phục vụ</option>
              <option value="shipper">Giao hàng</option>
            </select>
            <input type="number" min={0} className="input-base !py-1.5 text-sm w-24" placeholder="Số slot" value={slots} onChange={(e) => setSlots(e.target.value)} />
          </div>
          <div className="flex gap-2 items-center">
            <input type="time" className="input-base !py-1.5 text-sm flex-1" value={startTime} onChange={(e) => setStart(e.target.value)} />
            <span className="text-neutral-400">→</span>
            <input type="time" className="input-base !py-1.5 text-sm flex-1" value={endTime} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button onClick={doCreate} disabled={create.isPending} className="w-full py-2 bg-brand-gradient text-white rounded-xl text-sm font-bold disabled:opacity-50">Tạo ca</button>
        </div>
      )}

      {isLoading ? <p className="text-center text-neutral-400 py-6">Đang tải…</p> : (shifts ?? []).length === 0 ? (
        <p className="text-center text-neutral-400 py-8">Chưa có ca làm việc nào.</p>
      ) : (
        <div className="space-y-3">
          {shifts!.map((s) => {
            const full = s.slotsFilled >= s.slotsNeeded;
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-neutral-150 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-neutral-800 truncate">{s.label}</p>
                    <p className="text-xs text-neutral-400">{s.startTime}–{s.endTime} · {s.role ? ROLE_LABEL[s.role] : 'Chung'}</p>
                  </div>
                  <span className={`badge ${full ? 'badge-rose' : 'badge-emerald'} shrink-0`}>{s.slotsFilled}/{s.slotsNeeded}</span>
                </div>
                {s.assignments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.assignments.map((a) => (
                      <span key={a.id} className="text-[11px] bg-neutral-100 rounded-full px-2 py-0.5 text-neutral-600">{a.volunteer.user.fullName} · {ROLE_LABEL[a.role]}</span>
                    ))}
                  </div>
                )}
                {canApply && !full && (
                  <button onClick={() => doApply(s.id, s.role)} disabled={apply.isPending} className="mt-3 w-full py-2 bg-honey-500 hover:bg-honey-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                    Đăng ký ca này
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: An toàn thực phẩm ─────────────────────────────────────────────────────
function SafetyTab({ campaignId, canAdd }: { campaignId: string; canAdd: boolean }) {
  const { data: logs, isLoading } = useSafetyLogs(campaignId);
  const create = useCreateSafetyLog();

  const [checkType, setCheckType] = useState<SafetyCheckType>(SafetyCheckType.TEMPERATURE);
  const [measuredValue, setMeasured] = useState('');
  const [result, setResult] = useState<SafetyCheckResult>(SafetyCheckResult.PASS);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | undefined>();

  async function doAdd() {
    try {
      await create.mutateAsync({ campaignId, checkType, measuredValue: measuredValue || undefined, result, note: note || undefined, photo });
      toast.success('Đã ghi nhật ký ATTP.');
      setMeasured(''); setNote(''); setPhoto(undefined); setResult(SafetyCheckResult.PASS);
    } catch (e) { toast.error(errMsg(e, 'Ghi nhật ký thất bại')); }
  }

  return (
    <div className="space-y-4">
      {canAdd && (
        <div className="bg-white rounded-2xl border border-neutral-150 p-4 space-y-2">
          <div className="flex gap-2">
            <select className="input-base !py-1.5 text-sm flex-1" value={checkType} onChange={(e) => setCheckType(e.target.value as SafetyCheckType)}>
              {CHECK_TYPE.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input className="input-base !py-1.5 text-sm w-28" placeholder="Giá trị (75°C)" value={measuredValue} onChange={(e) => setMeasured(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {(Object.keys(RESULT_META) as SafetyCheckResult[]).map((r) => (
              <button key={r} onClick={() => setResult(r)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${result === r ? 'bg-honey-500 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{RESULT_META[r].label}</button>
            ))}
          </div>
          <input className="input-base !py-1.5 text-sm" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-500 cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">add_a_photo</span>{photo ? photo.name : 'Ảnh minh chứng (tuỳ chọn)'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0])} />
            </label>
            <button onClick={doAdd} disabled={create.isPending} className="px-4 py-2 bg-brand-gradient text-white rounded-xl text-sm font-bold disabled:opacity-50">Ghi</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-center text-neutral-400 py-6">Đang tải…</p> : (logs ?? []).length === 0 ? (
        <p className="text-center text-neutral-400 py-8">Chưa có mục kiểm tra nào.</p>
      ) : (
        <div className="space-y-2">
          {logs!.map((l) => (
            <div key={l.id} className="bg-white rounded-2xl border border-neutral-150 p-3 flex items-start gap-3">
              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(l.photoUrl)} alt="" className="w-14 h-14 rounded-xl object-cover border border-neutral-150" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-300"><span className="material-symbols-outlined">health_and_safety</span></div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-neutral-800">{CHECK_TYPE_LABEL[l.checkType]}</span>
                  {l.measuredValue && <span className="text-xs text-neutral-500">· {l.measuredValue}</span>}
                  <span className={`badge ${RESULT_META[l.result].badge} ml-auto`}>{RESULT_META[l.result].label}</span>
                </div>
                {l.note && <p className="text-xs text-neutral-600 mt-1">{l.note}</p>}
                <p className="text-[11px] text-neutral-400 mt-1">{l.checkedBy.user.fullName} · {formatDate(l.checkedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Phân phát ─────────────────────────────────────────────────────────────
function DistTab({ campaignId, canAdd }: { campaignId: string; canAdd: boolean }) {
  const { data: dists, isLoading } = useDistributions(campaignId);
  const { data: summary } = useDistributionSummary(campaignId);
  const create = useCreateDistribution();
  const feedback = useAddFeedback();

  const [roundLabel, setRound] = useState('');
  const [servings, setServings] = useState('');
  const [people, setPeople] = useState('');
  const [leftover, setLeftover] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | undefined>();
  const [fbFor, setFbFor] = useState<string | null>(null);
  const [fbScore, setFbScore] = useState(5);
  const [fbComment, setFbComment] = useState('');

  async function doAdd() {
    if (!servings || !people) { toast.error('Nhập số suất & số người.'); return; }
    try {
      await create.mutateAsync({
        campaignId, roundLabel: roundLabel || undefined,
        servingsServed: Number(servings), peopleServed: Number(people),
        leftoverServings: leftover ? Number(leftover) : undefined, note: note || undefined, photo,
      });
      toast.success('Đã ghi đợt phân phát.');
      setRound(''); setServings(''); setPeople(''); setLeftover(''); setNote(''); setPhoto(undefined);
    } catch (e) { toast.error(errMsg(e, 'Ghi phân phát thất bại')); }
  }

  async function doFeedback(distId: string) {
    try {
      await feedback.mutateAsync({ campaignId, distId, satisfaction: fbScore, comment: fbComment || undefined });
      toast.success('Cảm ơn phản hồi!');
      setFbFor(null); setFbComment(''); setFbScore(5);
    } catch (e) { toast.error(errMsg(e, 'Gửi phản hồi thất bại')); }
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Đợt', value: summary.rounds, icon: 'inventory' },
            { label: 'Suất', value: summary.totalServings, icon: 'lunch_dining' },
            { label: 'Người', value: summary.totalPeople, icon: 'groups' },
            { label: 'Thừa', value: summary.totalLeftover, icon: 'recycling' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-neutral-150 p-2.5 text-center">
              <span className="material-symbols-outlined text-[18px] text-emerald-600">{s.icon}</span>
              <p className="text-base font-extrabold text-neutral-800 leading-tight tabular-nums">{s.value}</p>
              <p className="text-[10px] text-neutral-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="bg-white rounded-2xl border border-neutral-150 p-4 space-y-2">
          <input className="input-base !py-1.5 text-sm" placeholder="Tên đợt (VD: Đợt 1 - 11h)" value={roundLabel} onChange={(e) => setRound(e.target.value)} />
          <div className="flex gap-2">
            <input type="number" min={0} className="input-base !py-1.5 text-sm flex-1" placeholder="Số suất" value={servings} onChange={(e) => setServings(e.target.value)} />
            <input type="number" min={0} className="input-base !py-1.5 text-sm flex-1" placeholder="Số người" value={people} onChange={(e) => setPeople(e.target.value)} />
            <input type="number" min={0} className="input-base !py-1.5 text-sm flex-1" placeholder="Thừa" value={leftover} onChange={(e) => setLeftover(e.target.value)} />
          </div>
          <input className="input-base !py-1.5 text-sm" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-500 cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">add_a_photo</span>{photo ? photo.name : 'Ảnh (tuỳ chọn)'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0])} />
            </label>
            <button onClick={doAdd} disabled={create.isPending} className="px-4 py-2 bg-brand-gradient text-white rounded-xl text-sm font-bold disabled:opacity-50">Ghi đợt</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-center text-neutral-400 py-6">Đang tải…</p> : (dists ?? []).length === 0 ? (
        <p className="text-center text-neutral-400 py-8">Chưa có đợt phân phát nào.</p>
      ) : (
        <div className="space-y-2">
          {dists!.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border border-neutral-150 p-3">
              <div className="flex items-center gap-3">
                {d.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(d.photoUrl)} alt="" className="w-12 h-12 rounded-xl object-cover border border-neutral-150" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500"><span className="material-symbols-outlined">volunteer_activism</span></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-800 truncate">{d.roundLabel ?? 'Đợt phân phát'}</p>
                  <p className="text-[11px] text-neutral-400">{d.servedByName} · {formatDate(d.distributedAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-neutral-800 tabular-nums">{d.peopleServed} người</p>
                  <p className="text-[11px] text-neutral-400 tabular-nums">{d.servingsServed} suất</p>
                </div>
              </div>
              {d.note && <p className="text-xs text-neutral-600 mt-2">{d.note}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-neutral-400 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">reviews</span>{d.feedbackCount} phản hồi</span>
                <button onClick={() => setFbFor(fbFor === d.id ? null : d.id)} className="text-xs text-emerald-700 font-bold">Gửi phản hồi</button>
              </div>
              {fbFor === d.id && (
                <div className="mt-2 border-t border-neutral-100 pt-2 space-y-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setFbScore(n)} className="text-[22px] leading-none">
                        <span className={n <= fbScore ? 'text-honey-500' : 'text-neutral-200'}>★</span>
                      </button>
                    ))}
                  </div>
                  <input className="input-base !py-1.5 text-sm" placeholder="Nhận xét (tuỳ chọn)" value={fbComment} onChange={(e) => setFbComment(e.target.value)} />
                  <button onClick={() => doFeedback(d.id)} disabled={feedback.isPending} className="w-full py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">Gửi</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
