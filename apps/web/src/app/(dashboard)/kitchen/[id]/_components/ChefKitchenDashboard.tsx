'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { SafetyCheckResult, SafetyCheckType } from '@foodresq/types';
import { type MyTask, usePublicCampaignDetail } from '@/hooks/useCampaigns';
import {
  type CampaignMenuItem,
  useCreateSafetyLog,
  useDistributionSummary,
  useDistributions,
  useMenuItems,
  useSafetyLogs,
  useShifts,
} from '@/hooks/useKitchenOps';
import { useRecipe } from '@/hooks/useRecipes';
import { errMsg, formatDate, mediaUrl } from '@/lib/utils';

const STEPS = [
  { key: 'assigned', label: 'Nhận việc', icon: 'assignment_turned_in' },
  { key: 'checked_in', label: 'Điểm danh', icon: 'location_on' },
  { key: 'in_progress', label: 'Đang nấu', icon: 'skillet' },
  { key: 'completed', label: 'Hoàn thành', icon: 'verified' },
];

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Đã nhận việc',
  checked_in: 'Đã điểm danh',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
};

const CHECK_TYPES: Array<{ value: SafetyCheckType; label: string }> = [
  { value: SafetyCheckType.TEMPERATURE, label: 'Nhiệt độ' },
  { value: SafetyCheckType.HYGIENE, label: 'Vệ sinh' },
  { value: SafetyCheckType.STORAGE, label: 'Bảo quản' },
  { value: SafetyCheckType.CROSS_CONTAMINATION, label: 'Nhiễm chéo' },
  { value: SafetyCheckType.HANDWASHING, label: 'Rửa tay' },
  { value: SafetyCheckType.OTHER, label: 'Khác' },
];

function RecipeStageCard({ item, stage }: { item: CampaignMenuItem; stage: 'prep' | 'cook' | 'finish' }) {
  const { data: recipe, isLoading } = useRecipe(item.recipeId ?? '');
  const title = recipe?.name ?? item.recipe?.name ?? item.customName ?? 'Món chưa đặt tên';
  const servings = item.plannedServings ?? recipe?.servings ?? item.recipe?.servings;
  const image = recipe?.imageUrls[0];

  let content: ReactNode;
  if (isLoading && item.recipeId) {
    content = <p className="text-[11px] text-emerald-100/70">Đang tải hướng dẫn…</p>;
  } else if (!item.recipeId) {
    content = <p className="text-[11px] text-emerald-100/70">Món tự do chưa có hướng dẫn công thức.</p>;
  } else if (stage === 'prep') {
    content = (
      <>
        <p className="text-[11px] text-emerald-100/70">{recipe?.prepMinutes ? `${recipe.prepMinutes} phút sơ chế` : 'Thời lượng chưa cập nhật'}</p>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/90">
          {recipe?.ingredients.length
            ? recipe.ingredients.slice(0, 3).map((ingredient) => `${ingredient.quantity ?? ''} ${ingredient.unit ?? ''} ${ingredient.name}`.trim()).join(' · ')
            : 'Chưa có nguyên liệu chi tiết.'}
        </p>
      </>
    );
  } else if (stage === 'cook') {
    content = (
      <>
        <p className="text-[11px] text-emerald-100/70">{recipe?.cookMinutes ? `${recipe.cookMinutes} phút nấu` : 'Thời lượng chưa cập nhật'}</p>
        <p className="mt-2 line-clamp-4 text-xs leading-5 text-white/90">{recipe?.instructions ?? 'Chưa có hướng dẫn nấu chi tiết.'}</p>
      </>
    );
  } else {
    content = (
      <>
        <p className="text-[11px] text-emerald-100/70">{servings ? `Mục tiêu ${servings} suất` : 'Chưa đặt số suất'}</p>
        <p className="mt-2 text-xs leading-5 text-white/90">
          {recipe?.difficulty ? `Độ khó: ${recipe.difficulty}` : 'Kiểm tra thành phẩm, định lượng và chuẩn bị ảnh kết quả.'}
        </p>
      </>
    );
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 shadow-sm">
      <div className="flex gap-2.5">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(image)} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-950/40 text-emerald-100">
            <span className="material-symbols-outlined text-[20px]">restaurant</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-bold text-white">{title}</h4>
          {content}
        </div>
      </div>
    </article>
  );
}

function WorkflowColumn({
  title,
  icon,
  tone,
  stage,
  items,
}: {
  title: string;
  icon: string;
  tone: string;
  stage: 'prep' | 'cook' | 'finish';
  items: CampaignMenuItem[];
}) {
  return (
    <section className={`min-w-[260px] flex-1 rounded-3xl border ${tone} p-3`}>
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="material-symbols-outlined text-[19px]">{icon}</span>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">{items.length}</span>
      </div>
      <div className="space-y-2.5">
        {items.length ? items.map((item) => <RecipeStageCard key={item.id} item={item} stage={stage} />) : (
          <p className="rounded-2xl border border-dashed border-current/20 px-3 py-5 text-center text-xs opacity-70">Chưa có món trong thực đơn.</p>
        )}
      </div>
    </section>
  );
}

function SafetyLogForm({ campaignId }: { campaignId: string }) {
  const create = useCreateSafetyLog();
  const [open, setOpen] = useState(false);
  const [checkType, setCheckType] = useState(SafetyCheckType.TEMPERATURE);
  const [result, setResult] = useState(SafetyCheckResult.PASS);
  const [measuredValue, setMeasuredValue] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    try {
      await create.mutateAsync({
        campaignId,
        checkType,
        result,
        measuredValue: measuredValue || undefined,
        note: note || undefined,
      });
      toast.success('Đã ghi nhật ký an toàn thực phẩm.');
      setOpen(false);
      setMeasuredValue('');
      setNote('');
      setResult(SafetyCheckResult.PASS);
    } catch (error) {
      toast.error(errMsg(error, 'Không thể ghi nhật ký ATTP'));
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><span className="material-symbols-outlined text-[16px]">add</span>Ghi kiểm tra ATTP</button>;
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={checkType} onChange={(event) => setCheckType(event.target.value as SafetyCheckType)} className="input-base !py-2 text-xs">
          {CHECK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <input value={measuredValue} onChange={(event) => setMeasuredValue(event.target.value)} className="input-base !py-2 text-xs" placeholder="Giá trị đo (tuỳ chọn)" />
      </div>
      <div className="flex gap-2">
        {[SafetyCheckResult.PASS, SafetyCheckResult.WARNING, SafetyCheckResult.FAIL].map((value) => (
          <button key={value} type="button" onClick={() => setResult(value)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${result === value ? 'bg-emerald-700 text-white' : 'bg-white text-neutral-600'}`}>
            {value === SafetyCheckResult.PASS ? 'Đạt' : value === SafetyCheckResult.WARNING ? 'Cảnh báo' : 'Không đạt'}
          </button>
        ))}
      </div>
      <input value={note} onChange={(event) => setNote(event.target.value)} className="input-base !py-2 text-xs" placeholder="Ghi chú (tuỳ chọn)" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-neutral-500">Huỷ</button>
        <button type="button" onClick={() => void submit()} disabled={create.isPending} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{create.isPending ? 'Đang lưu...' : 'Lưu nhật ký'}</button>
      </div>
    </div>
  );
}

export default function ChefKitchenDashboard({ task }: { task: MyTask }) {
  const campaignId = task.campaign.id;
  const { data: campaign } = usePublicCampaignDetail(campaignId);
  const { data: menuItems = [] } = useMenuItems(campaignId);
  const { data: shifts = [] } = useShifts(campaignId);
  const { data: safetyLogs = [] } = useSafetyLogs(campaignId);
  const { data: distributions = [] } = useDistributions(campaignId);
  const { data: distributionSummary } = useDistributionSummary(campaignId);
  const stepIndex = STEPS.findIndex((step) => step.key === task.status);
  const warnings = safetyLogs.filter((log) => log.result === SafetyCheckResult.WARNING || log.result === SafetyCheckResult.FAIL);
  const chefAssignments = shifts.flatMap((shift) => shift.assignments.filter((assignment) => assignment.role === 'chef'));
  const supplyProgress = campaign?.supplyProgress ?? [];
  const supplyReady = supplyProgress.length
    ? Math.round(supplyProgress.reduce((sum, item) => sum + item.progressPercent, 0) / supplyProgress.length)
    : null;
  return (
    <main id="workspace" className="mx-auto w-full max-w-7xl scroll-mt-6 px-4 py-5 md:px-6 md:py-8">
      <Link href="/campaigns?tab=tasks" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-emerald-800">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>Việc của tôi
      </Link>

      <section className="overflow-hidden rounded-[28px] bg-[#123c2d] text-white shadow-xl shadow-emerald-950/15">
        <div className="relative px-5 py-6 md:px-8 md:py-8">
          <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-extrabold text-emerald-100">KHÔNG GIAN ĐẦU BẾP</span>
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/90">{STATUS_LABEL[task.status] ?? task.status}</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">{task.campaign.title}</h1>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-emerald-100/80">
                <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[17px]">schedule</span>{task.campaign.startTime}–{task.campaign.endTime} · {new Date(task.campaign.scheduledDate).toLocaleDateString('vi-VN')}</span>
                <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[17px]">location_on</span>{task.campaign.kitchenAddress}</span>
              </p>
            </div>
          </div>

          <div className="relative mt-7 grid grid-cols-2 gap-2 md:grid-cols-4">
            {STEPS.map((step, index) => {
              const done = index <= stepIndex;
              return <div key={step.key} className={`rounded-2xl border p-3 ${done ? 'border-emerald-300/30 bg-emerald-300/15' : 'border-white/10 bg-white/[0.04]'}`}>
                <span className={`material-symbols-outlined text-[20px] ${done ? 'text-emerald-200' : 'text-white/35'}`}>{step.icon}</span>
                <p className="mt-1 text-xs font-bold">{step.label}</p>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cm-card p-4"><span className="material-symbols-outlined text-emerald-600">inventory_2</span><p className="mt-2 text-2xl font-black text-neutral-900">{supplyReady == null ? '—' : `${supplyReady}%`}</p><p className="text-xs font-semibold text-neutral-500">Mức sẵn sàng nguyên liệu</p></div>
        <div className="cm-card p-4"><span className="material-symbols-outlined text-emerald-600">lunch_dining</span><p className="mt-2 text-2xl font-black text-neutral-900">{distributionSummary?.totalServings ?? 0}</p><p className="text-xs font-semibold text-neutral-500">Suất đã phân phát</p></div>
        <div className="cm-card p-4"><span className="material-symbols-outlined text-emerald-600">groups</span><p className="mt-2 text-2xl font-black text-neutral-900">{chefAssignments.length}</p><p className="text-xs font-semibold text-neutral-500">Đầu bếp trong ca</p></div>
        <div className="cm-card p-4"><span className="material-symbols-outlined text-emerald-600">volunteer_activism</span><p className="mt-2 text-2xl font-black text-neutral-900">{distributionSummary?.totalPeople ?? 0}</p><p className="text-xs font-semibold text-neutral-500">Người đã nhận suất</p></div>
      </section>

      {warnings.length > 0 && (
        <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3"><span className="material-symbols-outlined text-amber-700">warning</span><div><h2 className="font-extrabold text-amber-950">Cần lưu ý về an toàn thực phẩm</h2><p className="mt-1 text-sm text-amber-900">Có {warnings.length} mục cần được kiểm tra lại trước khi hoàn thiện món.</p></div></div>
          <div className="mt-3 space-y-2">{warnings.slice(0, 3).map((log) => <div key={log.id} className="rounded-xl bg-white/80 px-3 py-2 text-xs text-neutral-700"><strong>{CHECK_TYPES.find((type) => type.value === log.checkType)?.label ?? log.checkType}</strong> · {log.note ?? log.measuredValue ?? 'Chưa có ghi chú'} <span className="text-neutral-400">· {formatDate(log.checkedAt)}</span></div>)}</div>
        </section>
      )}

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-xl font-black text-neutral-900">Bảng hướng dẫn công việc bếp</h2><p className="mt-1 text-sm text-neutral-500">Các cột là hướng dẫn theo công thức, không phải trạng thái riêng của từng món.</p></div><span className="cm-chip cm-chip--mint">{menuItems.length} món trong thực đơn</span></div>
          <div className="flex gap-4 overflow-x-auto pb-2 xl:grid xl:grid-cols-3 xl:overflow-visible">
            <WorkflowColumn title="Sơ chế" icon="cut" stage="prep" items={menuItems} tone="border-emerald-800 bg-[#174f39] text-emerald-50" />
            <WorkflowColumn title="Đang nấu" icon="skillet" stage="cook" items={menuItems} tone="border-[#215b44] bg-[#123c2d] text-emerald-50" />
            <WorkflowColumn title="Hoàn thiện" icon="restaurant" stage="finish" items={menuItems} tone="border-amber-300/30 bg-[#6d5522] text-amber-50" />
          </div>
        </div>

        <aside className="space-y-4">
          <section className="cm-card p-4"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-emerald-700">group</span><h2 className="font-extrabold text-neutral-900">Nhân sự ca bếp</h2></div><div className="mt-3 space-y-2">{chefAssignments.length ? chefAssignments.map((assignment) => <div key={assignment.id} className="flex items-center gap-2 rounded-xl bg-neutral-50 p-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">{assignment.volunteer.user.fullName.slice(0, 1)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-neutral-800">{assignment.volunteer.user.fullName}</p><p className="text-[11px] text-neutral-400">{STATUS_LABEL[assignment.status] ?? assignment.status}</p></div></div>) : <p className="text-xs text-neutral-400">Chưa có đầu bếp được xếp ca.</p>}</div></section>
          <section className="cm-card p-4"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-emerald-700">health_and_safety</span><h2 className="font-extrabold text-neutral-900">Nhật ký ATTP</h2></div><p className="mt-2 text-xs text-neutral-500">{safetyLogs.length ? `${safetyLogs.length} lượt kiểm tra đã ghi nhận.` : 'Chưa có lượt kiểm tra nào.'}</p><SafetyLogForm campaignId={campaignId} /></section>
          <section className="cm-card p-4"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-emerald-700">schedule</span><h2 className="font-extrabold text-neutral-900">Các đợt phân phát</h2></div><div className="mt-3 space-y-2">{distributions.slice(0, 3).map((distribution) => <div key={distribution.id} className="rounded-xl bg-neutral-50 p-2 text-xs"><p className="font-bold text-neutral-800">{distribution.roundLabel ?? 'Đợt phân phát'}</p><p className="mt-0.5 text-neutral-500">{distribution.servingsServed} suất · {distribution.peopleServed} người</p></div>)}{distributions.length === 0 && <p className="text-xs text-neutral-400">Chưa có đợt phân phát.</p>}</div></section>
        </aside>
      </section>

      {campaign?.proofGallery.length ? (
        <section className="mt-5">
          <h2 className="mb-3 text-lg font-black text-neutral-900">Ảnh minh chứng chiến dịch</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {campaign.proofGallery.map((proof, index) => (
              <div key={`${proof.url}-${index}`} className="w-32 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(proof.url)}
                  alt={`Ảnh minh chứng ${proof.kind}`}
                  className="h-24 w-32 rounded-2xl object-cover"
                />
                <p className="mt-1 truncate text-[11px] text-neutral-500">{proof.by}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
