'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  useMyTaskDetail,
  useTickDishStep,
  useAdvanceTask,
  useCampaignSupplies,
  type DishStep,
  type DishProcessItem,
  type CookingTeamMember,
  type SafetyLog,
} from '@/hooks/useCampaigns';
import { useMe } from '@/hooks/useProfile';
import ShipperTaskView from './ShipperTaskView';
import WaiterTaskView from './WaiterTaskView';
import { errMsg, mediaUrl } from '@/lib/utils';

const STEP_ICONS: Record<number, string> = {
  1: 'inventory_2',
  2: 'soup_kitchen',
  3: 'fact_check',
  4: 'local_shipping',
};

// Nhãn 4 khâu — PHẢI khớp từng chữ với FIXED_DISH_STEPS của backend và dữ liệu
// campaign_dish_steps, nếu không hai màn chef/tổ chức gọi cùng một khâu bằng hai tên.
const STEP_LABELS: Record<number, string> = {
  1: 'Sơ chế',
  2: 'Nấu',
  3: 'Kiểm tra QC',
  4: 'Sẵn sàng xuất phát',
};

const STEP_DESCRIPTIONS: Record<number, string> = {
  1: 'Sơ chế nguyên liệu, chụp ảnh đối chiếu đồ còn dùng được',
  2: 'Chế biến món theo công thức đã định',
  3: 'Kiểm tra chất lượng, vệ sinh, nhiệt độ…',
  4: 'Hoàn tất và sẵn sàng xuất phát',
};

const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

const STATUS_META: Record<string, { label: string; chip: string }> = {
  assigned: { label: 'Đã nhận việc', chip: 'cm-chip cm-chip--sky' },
  checked_in: { label: 'Đã điểm danh', chip: 'cm-chip cm-chip--mint' },
  in_progress: { label: 'Đang làm', chip: 'cm-chip cm-chip--honey' },
  completed: { label: 'Hoàn thành', chip: 'cm-chip cm-chip--mint' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--ink' },
  absent: { label: 'Vắng', chip: 'cm-chip cm-chip--rose' },
  rejected: { label: 'Bị từ chối', chip: 'cm-chip cm-chip--rose' },
  pending: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey' },
};

const SAFETY_TYPE_LABEL: Record<string, string> = {
  temperature: 'Nhiệt độ',
  hygiene: 'Vệ sinh',
  storage: 'Bảo quản',
  cross_contamination: 'Lây chéo',
  handwashing: 'Rửa tay',
};

export default function MyTaskDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const { data: me } = useMe();
  const { data: detail, isLoading, refetch } = useMyTaskDetail(params.assignmentId);
  const tick = useTickDishStep();
  const advance = useAdvanceTask();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingStep, setPendingStep] = useState<DishStep | null>(null);
  const [note, setNote] = useState('');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [safetyLogOpen, setSafetyLogOpen] = useState(false);
  const [suppliesOpen, setSuppliesOpen] = useState(true);
  const campaignId = detail?.campaign?.id;
  const { data: supplies } = useCampaignSupplies(campaignId);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-10 w-48 skeleton rounded-xl mb-4" />
        <div className="h-40 w-full skeleton rounded-2xl mb-4" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center">
        <p className="text-neutral-500">Không tìm thấy nhiệm vụ.</p>
        <button
          type="button"
          onClick={() => router.push('/campaigns?tab=tasks')}
          className="mt-4 text-emerald-700 font-semibold hover:underline"
        >
          ← Quay lại
        </button>
      </div>
    );
  }

  const { assignment, campaign, dishes = [], cookingTeam = [], safetyLogs = [], delivery } = detail;
  const statusMeta = STATUS_META[assignment.status] ?? { label: assignment.status, chip: 'cm-chip cm-chip--ink' };
  const isShipper = assignment.role === 'shipper';
  const isChef = assignment.role === 'chef';
  // Phục vụ không nấu — họ chờ bếp ra món rồi chia suất, nên có màn riêng như shipper
  // thay vì dùng chung bảng 4 khâu của đầu bếp.
  const isWaiter = assignment.role === 'waiter';

  const notCheckedIn = !['checked_in', 'in_progress', 'completed'].includes(assignment.status);
  const canAct = !notCheckedIn && assignment.status !== 'completed';

  async function handleCheckIn() {
    setIsCheckingIn(true);
    try {
      await advance.mutateAsync({ assignmentId: assignment.id });
      toast.success('Điểm danh thành công! Bây giờ bạn có thể xem danh sách món cần nấu.');
      window.location.reload();
    } catch (error) {
      toast.error(errMsg(error, 'Điểm danh thất bại — thử lại'));
    } finally {
      setIsCheckingIn(false);
    }
  }

  function startTick(step: DishStep) {
    setPendingStep(step);
    setNote('');
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingStep || !detail) return;
    try {
      await tick.mutateAsync({
        campaignId: detail.campaign.id,
        stepId: pendingStep.id,
        proof: file,
        note: note || undefined,
      });
      toast.success(`Đã xác nhận hoàn thành "${pendingStep.stepName}".`);
      setPendingStep(null);
      setNote('');
    } catch (error) {
      toast.error(errMsg(error, 'Không thể xác nhận — thử lại'));
    }
  }

  const totalSteps = dishes.reduce((sum, d) => sum + d.steps.length, 0);
  const doneSteps = dishes.reduce(
    (sum, d) => sum + d.steps.filter((s) => s.effectiveStatus === 'done').length,
    0,
  );
  const overallPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const myTeamMembers = cookingTeam.filter((m) => m.isMe);
  const otherChefs = cookingTeam.filter((m) => !m.isMe);

  return (
    <div className="cm-scope p-4 md:p-6 max-w-5xl mx-auto pb-24">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-500 mb-4">
        <Link href="/campaigns?tab=tasks" className="hover:text-emerald-700">
          Việc của tôi
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="font-semibold text-neutral-700">{campaign.title}</span>
      </div>

      {/* Shipper có quy trình khác hẳn bếp: không có 4 khâu nấu, mà là chuỗi việc
          giao nhận theo giờ. Tách hẳn view riêng cho khỏi nhồi hai luồng vào một chỗ. */}
      {(isShipper || isWaiter) && (
        <>
          <header className="cm-card mb-4 p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              {ROLE_LABEL[assignment.role]}
              {assignment.shift?.label ? ` · ${assignment.shift.label}` : ''}
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-neutral-900 md:text-2xl">
              {campaign.title}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
              <span className="material-symbols-outlined text-[16px]">place</span>
              {campaign.kitchenAddress}
            </p>
            <span className={`${statusMeta.chip} mt-3 inline-flex`}>{statusMeta.label}</span>
          </header>
          {isShipper ? (
            <ShipperTaskView detail={detail} onCheckedIn={() => void refetch()} />
          ) : (
            <WaiterTaskView detail={detail} onCheckedIn={() => void refetch()} />
          )}
        </>
      )}

      {!isShipper && !isWaiter && (
      <>

      {/* Header */}
      <header className="cm-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              {ROLE_LABEL[assignment.role] ?? assignment.role}
              {assignment.shift?.label ? ` · ${assignment.shift.label}` : ''}
            </p>
            <h1 className="text-xl md:text-2xl font-extrabold text-neutral-900 mt-1">
              {campaign.title}
            </h1>
            <p className="text-sm text-neutral-500 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">place</span>
              {campaign.kitchenAddress}
            </p>
          </div>
          <span className={statusMeta.chip}>{statusMeta.label}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <InfoTile icon="event" label="Ngày" value={new Date(campaign.scheduledDate).toLocaleDateString('vi-VN')} />
          <InfoTile icon="schedule" label="Giờ" value={`${campaign.startTime}–${campaign.endTime}`} />
          <InfoTile icon="group" label="Tổ chức" value={campaign.charityReceiver.organizationName ?? campaign.charityReceiver.user.fullName} />
          <InfoTile icon="percent" label="Tiến độ" value={`${doneSteps}/${totalSteps} khâu (${overallPct}%)`} />
        </div>

        {notCheckedIn && (
          <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600">info</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-900 text-sm">Bạn chưa điểm danh tại bếp</p>
              <p className="text-xs text-amber-800 mt-1">
                Sau khi điểm danh thành công, bạn sẽ thấy danh sách món cần nấu và quy trình 4 khâu bên dưới.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={isCheckingIn || advance.isPending}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isCheckingIn || advance.isPending ? 'Đang điểm danh…' : 'Điểm danh ngay'}
            </button>
          </div>
        )}

        {assignment.status === 'completed' && (
          <div className="mt-5 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-600">verified</span>
            <p className="font-bold text-emerald-900 text-sm">
              Hoàn thành — cảm ơn bạn đã đóng góp cho chiến dịch!
              {assignment.pointsAwarded ? ` (+${assignment.pointsAwarded} điểm cống hiến)` : ''}
            </p>
          </div>
        )}
      </header>

      {/* Đội bếp */}
      {isChef && cookingTeam.length > 0 && (
        <section className="mt-5">
          <div className="cm-section-head">
            <h2 className="cm-section-title">
              <span className="material-symbols-outlined text-emerald-600">groups</span>
              Đội bếp ({cookingTeam.length} người)
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {cookingTeam.map((m) => (
              <div key={m.volunteerId} className="cm-card !p-3 flex items-center gap-2">
                <div className="relative shrink-0">
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(m.avatarUrl)} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 ring-2 ring-white">
                      {m.fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {m.isMe && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" title="Bạn" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 truncate">
                    {m.fullName}
                    {m.isMe && ' (bạn)'}
                  </p>
                  {m.shift && (
                    <p className="text-[10px] text-neutral-500">{m.shift.label}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Safety logs */}
      {isChef && (
        <section className="mt-5">
          <div className="cm-section-head">
            <h2 className="cm-section-title">
              <span className="material-symbols-outlined text-emerald-600">verified_user</span>
              Kiểm tra an toàn thực phẩm
            </h2>
            <button
              type="button"
              onClick={() => setSafetyLogOpen((v) => !v)}
              className="text-xs text-emerald-700 font-bold hover:underline"
            >
              {safetyLogOpen ? 'Thu gọn' : 'Xem chi tiết'}
            </button>
          </div>
          {safetyLogOpen && (
            <div className="cm-card divide-y divide-neutral-100">
              {safetyLogs.length === 0 ? (
                <p className="p-4 text-xs text-neutral-400 italic text-center">Chưa có bản ghi kiểm tra nào.</p>
              ) : (
                safetyLogs.map((log) => (
                  <SafetyLogRow key={log.id} log={log} />
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* Nguyên liệu — 2 nguồn: đăng ký (request) + đã nhận (received) */}
      <section className="mt-5">
        <div className="cm-section-head">
          <h2 className="cm-section-title">
            <span className="material-symbols-outlined text-emerald-600">inventory_2</span>
            Nguyên liệu (cần {supplies?.requested?.length ?? 0} · đã có {supplies?.total ?? 0})
          </h2>
          <button
            type="button"
            onClick={() => setSuppliesOpen((v) => !v)}
            className="text-xs text-emerald-700 font-bold hover:underline"
          >
            {suppliesOpen ? 'Thu gọn' : 'Xem chi tiết'}
          </button>
        </div>
        {suppliesOpen && (
          <div className="space-y-3">
            {!supplies ? (
              <div className="cm-card p-4">
                <p className="text-xs text-neutral-400 italic text-center py-4">
                  Đang tải nguyên liệu…
                </p>
              </div>
            ) : (
              <>
                {/* 1. CẦN — từ supplyItems (lúc đăng ký) */}
                <div className="cm-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-amber-600 text-[18px]">
                      shopping_basket
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      Cần ({supplies.requested.length})
                    </p>
                    <p className="text-[10px] text-neutral-400 ml-auto">
                      Tổ chức khai báo lúc đăng ký
                    </p>
                  </div>
                  {supplies.requested.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic">
                      Tổ chức không khai báo nguyên liệu cần lúc đăng ký.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {supplies.requested.map((it, i) => (
                        <li
                          key={`${it.name}-${i}`}
                          className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2"
                        >
                          <span className="material-symbols-outlined text-amber-600 text-[18px]">
                            shopping_basket
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-neutral-900 truncate">
                              {it.name}
                              {it.quantity != null && (
                                <span className="ml-1 text-xs font-normal text-neutral-500">
                                  · {it.quantity}
                                  {it.unit ? ` ${it.unit}` : ''}
                                </span>
                              )}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 2. ĐÃ CÓ — từ donations received */}
                <div className="cm-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-emerald-600 text-[18px]">
                      check_circle
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Đã có ({supplies.total})
                    </p>
                    <p className="text-[10px] text-neutral-400 ml-auto">
                      Provider góp + tổ chức đã nhận
                    </p>
                  </div>
                  {supplies.items.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic">
                      Chưa có thực phẩm nào được xác nhận nhận cho chiến dịch này.
                    </p>
                  ) : (
                    <>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {supplies.items.map((it) => (
                          <li
                            key={it.itemName}
                            className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2"
                          >
                            <span className="material-symbols-outlined text-emerald-600 text-[18px]">
                              check_circle
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-neutral-900 truncate">
                                {it.itemName}
                              </p>
                              <p className="text-[11px] text-neutral-500">
                                {it.entries} lượt góp
                                {it.quantities.length > 0
                                  ? ` · ${it.quantities.join(' + ')}`
                                  : ''}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {supplies.donations.length > 0 && (
                        <details className="mt-3">
                          <summary className="text-[11px] font-bold text-neutral-500 cursor-pointer hover:text-emerald-700">
                            Chi tiết từng lượt góp ({supplies.donations.length})
                          </summary>
                          <ul className="mt-2 divide-y divide-neutral-100">
                            {supplies.donations.map((d) => (
                              <li
                                key={d.id}
                                className="py-1.5 text-[11px] flex items-center gap-2 text-neutral-600"
                              >
                                <span className="material-symbols-outlined text-[14px] text-neutral-400">
                                  storefront
                                </span>
                                <span className="font-semibold text-neutral-800">
                                  {d.provider.businessName}
                                </span>
                                <span className="text-neutral-400">·</span>
                                <span className="truncate">{d.itemName}</span>
                                {d.quantity && (
                                  <span className="text-neutral-500">{d.quantity}</span>
                                )}
                                {d.receivedAt && (
                                  <span className="ml-auto text-neutral-400">
                                    {new Date(d.receivedAt).toLocaleString('vi-VN', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Danh sách món */}
      <section className="mt-6 space-y-5">
        <div className="cm-section-head">
          <h2 className="cm-section-title">
            <span className="material-symbols-outlined text-emerald-600">soup_kitchen</span>
            Danh sách món cần chuẩn bị ({dishes.length})
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Mỗi khâu phải chờ <b>đến giờ dự kiến</b> VÀ <b>khâu trước hoàn thành</b> mới có thể tick.
          </p>
        </div>

        {dishes.length === 0 ? (
          <div className="cm-card p-10 text-center">
            <span className="material-symbols-outlined text-neutral-300 text-[48px]">restaurant_menu</span>
            <p className="font-bold text-neutral-700 mt-3">Bếp trưởng chưa thêm món cho chiến dịch</p>
            <p className="text-xs text-neutral-400 mt-1">Liên hệ tổ chức để được bổ sung thực đơn.</p>
          </div>
        ) : (
          dishes.map((dish) => (
            <DishProcessBoard
              key={dish.id}
              dish={dish}
              canAct={canAct}
              onTick={startTick}
              pending={tick.isPending}
              myAvatarUrl={me?.avatarUrl ?? null}
              myName={me?.fullName ?? 'Bạn'}
              expandedRecipe={expandedRecipe}
              onToggleRecipe={(id) => setExpandedRecipe((prev) => (prev === id ? null : id))}
              isChef={isChef}
            />
          ))
        )}
      </section>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {pendingStep && (
        <p className="mt-6 text-center text-xs text-neutral-500">
          Đang upload ảnh cho <b>"{pendingStep.stepName}"</b>… giữ điện thoại thẳng đứng 🌿
        </p>
      )}

      </>
      )}
    </div>
  );
}

function SafetyLogRow({ log }: { log: SafetyLog }) {
  const resultMeta: Record<string, { icon: string; cls: string; label: string }> = {
    pass: { icon: 'check_circle', cls: 'text-emerald-600', label: 'Đạt' },
    warning: { icon: 'warning', cls: 'text-amber-600', label: 'Cảnh báo' },
    fail: { icon: 'cancel', cls: 'text-rose-600', label: 'Không đạt' },
  };
  const meta = resultMeta[log.result] ?? resultMeta.pass;

  return (
    <div className="p-3 flex items-start gap-3">
      <span className={`material-symbols-outlined text-[18px] ${meta.cls} shrink-0 mt-0.5`}>{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-neutral-800">{SAFETY_TYPE_LABEL[log.checkType] ?? log.checkType}</span>
          {log.measuredValue && (
            <span className="text-xs text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">{log.measuredValue}</span>
          )}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.cls} bg-opacity-10`}>
            {meta.label}
          </span>
        </div>
        {log.note && <p className="text-[11px] text-neutral-500 mt-0.5">{log.note}</p>}
        <p className="text-[10px] text-neutral-400 mt-1">
          {log.checkedBy.user.fullName} · {new Date(log.checkedAt).toLocaleString('vi-VN')}
        </p>
      </div>
      {log.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(log.photoUrl)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
      )}
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="cm-tile !p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {label}
      </div>
      <p className="text-sm font-bold text-neutral-900 mt-1 truncate">{value}</p>
    </div>
  );
}

function DishProcessBoard({
  dish,
  canAct,
  onTick,
  pending,
  myAvatarUrl,
  myName,
  expandedRecipe,
  onToggleRecipe,
  isChef,
}: {
  dish: DishProcessItem;
  canAct: boolean;
  onTick: (s: DishStep) => void;
  pending: boolean;
  myAvatarUrl: string | null;
  myName: string;
  expandedRecipe: string | null;
  onToggleRecipe: (id: string) => void;
  isChef: boolean;
}) {
  const doneCount = dish.steps.filter((s) => s.effectiveStatus === 'done').length;
  const totalCount = dish.steps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const hasRecipe = !!dish.recipe;
  // QC bị từ chối = món đã bị tổ chức huỷ — trạng thái cuối.
  const dishCancelled = dish.steps.some(
    (st) => st.stepOrder === 3 && st.reviewStatus === 'rejected',
  );
  const isRecipeOpen = expandedRecipe === dish.id;

  return (
    <article className="cm-card overflow-hidden">
      {/* Header món */}
      <div className="p-4 md:p-5 bg-gradient-to-br from-emerald-50 to-white border-b border-neutral-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-neutral-900 text-base md:text-lg">
              🍲 {dish.name}
            </h3>
            {/* Tổ chức từ chối ảnh QC = món bị HUỶ hẳn — báo rõ để chef không chờ
                khâu 4 mở hay cố chụp lại ảnh. */}
            {(() => {
              const qc = dish.steps.find((st) => st.stepOrder === 3);
              if (qc?.reviewStatus !== 'rejected') return null;
              return (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-rose-700">
                    <span className="material-symbols-outlined text-[16px]">block</span>
                    Món đã bị huỷ — QC không đạt
                  </p>
                  <p className="mt-1 text-xs text-rose-800">
                    Lý do từ tổ chức: {qc.reviewNote || 'không ghi rõ'}. Món này sẽ không được
                    phát; các món khác vẫn tiếp tục bình thường.
                  </p>
                </div>
              );
            })()}
            {dish.steps.some((s) => s.qcFailedAt) && (() => {
              const failStep = dish.steps.find((s) => s.qcFailedAt)!;
              const failerName = failStep.qcFailedByVolunteer?.user.fullName;
              return (
                <div className="mt-2 rounded-xl bg-rose-50 border border-rose-200 p-2.5 flex items-start gap-2">
                  <span className="material-symbols-outlined text-rose-600 text-[18px] mt-0.5 shrink-0">emergency</span>
                  <div className="text-xs text-rose-900 min-w-0">
                    <p className="font-bold flex items-center gap-1.5">
                      QC fail — {STEP_LABELS[failStep.stepOrder] ?? failStep.stepName}
                      <span className="text-[10px] font-normal text-rose-700">
                        · {new Date(failStep.qcFailedAt!).toLocaleString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-rose-800">
                      {failStep.qcFailureReason ?? 'Không có lý do cụ thể.'}
                    </p>
                    {failerName && (
                      <p className="mt-0.5 text-[10px] text-rose-700">
                        Báo cáo bởi {failerName} · Tổ chức đã nhận thông báo khẩn.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
            <p className="text-xs text-neutral-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {dish.plannedServings ? (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">restaurant</span>
                  {dish.plannedServings} suất
                </span>
              ) : (
                <span className="flex items-center gap-1 text-neutral-400">
                  <span className="material-symbols-outlined text-[12px]">restaurant</span>
                  Chưa đặt suất
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">checklist</span>
                {doneCount}/{totalCount} khâu
              </span>
              {dish.recipe?.prepMinutes != null && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">timer</span>
                  sơ chế {dish.recipe.prepMinutes}p
                </span>
              )}
              {dish.recipe?.cookMinutes != null && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">whatshot</span>
                  nấu {dish.recipe.cookMinutes}p
                </span>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-extrabold text-emerald-700">{pct}%</p>
          </div>
        </div>
        <div className="h-1.5 bg-neutral-100 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>

        {/* Recipe accordion */}
        {hasRecipe && isChef && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onToggleRecipe(dish.id)}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isRecipeOpen ? 'expand_less' : 'expand_more'}
              </span>
              {isRecipeOpen ? 'Thu gọn công thức' : 'Xem công thức & nguyên liệu'}
            </button>
            {isRecipeOpen && dish.recipe && (
              <div className="mt-2 rounded-xl bg-white border border-emerald-100 p-3 space-y-2">
                {dish.recipe.description && (
                  <p className="text-xs text-neutral-600">{dish.recipe.description}</p>
                )}
                {dish.recipe.ingredients && dish.recipe.ingredients.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">Nguyên liệu</p>
                    <ul className="space-y-0.5">
                      {dish.recipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-neutral-700">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <span>{ing.name}</span>
                          {ing.quantity && <span className="text-neutral-400">{ing.quantity}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {dish.recipe.instructions && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">Cách làm</p>
                    <p className="text-xs text-neutral-600 whitespace-pre-wrap leading-relaxed">{dish.recipe.instructions}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4 step ngang */}
      <ol className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
        {dish.steps.map((step, idx) => (
          <StepCell
            key={step.id}
            step={step}
            // Món đã bị tổ chức huỷ (QC rejected) → khoá mọi thao tác, kể cả khi dữ
            // liệu cũ còn để khâu 3 ở 'available' theo luật chụp-lại trước đây.
            canAct={canAct && !dishCancelled}
            onTick={() => onTick(step)}
            pending={pending}
            prevStepDone={idx === 0 || dish.steps[idx - 1]?.effectiveStatus === 'done'}
            // Khâu 4 bị giữ vì ảnh QC (khâu 3) chưa được tổ chức duyệt
            awaitingQcReview={
              step.stepOrder === 4 &&
              dish.steps[idx - 1]?.effectiveStatus === 'done' &&
              dish.steps[idx - 1]?.reviewStatus !== 'approved'
            }
            myAvatarUrl={myAvatarUrl}
            myName={myName}
          />
        ))}
      </ol>
    </article>
  );
}

function StepCell({
  step,
  canAct,
  onTick,
  pending,
  prevStepDone,
  awaitingQcReview,
  myAvatarUrl,
  myName,
}: {
  step: DishStep;
  canAct: boolean;
  onTick: () => void;
  pending: boolean;
  prevStepDone: boolean;
  /** true khi khâu 4 bị giữ vì ảnh QC chưa được tổ chức duyệt. */
  awaitingQcReview?: boolean;
  myAvatarUrl: string | null;
  myName: string;
}) {
  const eff = step.effectiveStatus;
  const isDone = eff === 'done';
  const isAvailable = eff === 'available';
  const isLocked = eff === 'locked';
  const isQCStep = step.stepOrder === 3;
  const isQcFailed = !!step.qcFailedAt;

  const baseClasses = 'p-4 flex flex-col gap-2 transition-colors';
  const stateClasses = isQcFailed
    ? 'bg-rose-50 ring-1 ring-rose-200'
    : isDone
      ? 'bg-emerald-50'
      : isAvailable
        ? isQCStep
          ? 'bg-white ring-1 ring-amber-300'
          : 'bg-white ring-1 ring-emerald-200'
        : 'bg-neutral-50 opacity-70';

  const completedBy = step.completedByVolunteer;
  const completedByLabel = isDone
    ? completedBy?.user.fullName === myName
      ? 'Bạn'
      : completedBy?.user.fullName ?? '—'
    : null;

  return (
    <li className={`${baseClasses} ${stateClasses}`}>
      <div className="flex items-center justify-between">
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
            isQcFailed
              ? 'bg-rose-600 text-white'
              : isDone
                ? 'bg-emerald-600 text-white'
                : isAvailable
                  ? isQCStep
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                  : 'bg-neutral-200 text-neutral-500'
          }`}
          title={step.stepName}
        >
          {isQcFailed ? (
            <span className="material-symbols-outlined text-[20px]">emergency</span>
          ) : isDone ? (
            <span className="material-symbols-outlined text-[20px]">check</span>
          ) : (
            <span className="material-symbols-outlined text-[20px]">{STEP_ICONS[step.stepOrder]}</span>
          )}
        </span>
        <span className="text-xs font-bold text-neutral-500">Khâu {step.stepOrder}</span>
      </div>

      <div>
        <p className="font-extrabold text-sm text-neutral-900">{STEP_LABELS[step.stepOrder] ?? step.stepName}</p>
        <p className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2 leading-snug">
          {STEP_DESCRIPTIONS[step.stepOrder] ?? ''}
        </p>
        <p className="text-[11px] text-neutral-500 flex items-center gap-1 mt-1">
          <span className="material-symbols-outlined text-[12px]">schedule</span>
          {step.scheduledTime}
        </p>
      </div>

      {isDone && step.proofUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(step.proofUrl)}
          alt={`Bằng chứng ${step.stepName}`}
          className="w-full h-20 object-cover rounded-lg border border-emerald-200"
        />
      )}

      {isDone && step.completedAt && (
        <div className="rounded-lg bg-white border border-emerald-100 px-2 py-1.5 text-[10px] text-neutral-600">
          <p className="flex items-center gap-1 font-semibold text-neutral-700">
            <span className="material-symbols-outlined text-[12px] text-emerald-600">photo_camera</span>
            <span className="text-emerald-700">Đã chụp</span>
          </p>
          <p className="mt-0.5 pl-[18px]">
            {new Date(step.completedAt).toLocaleString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour12: false,
            })}
          </p>
          {completedBy?.user && (
            <p className="pl-[18px] mt-0.5 text-neutral-500">
              bởi {completedBy.user.fullName === myName ? 'bạn' : completedBy.user.fullName}
            </p>
          )}
        </div>
      )}

      {step.note && isDone && (
        <p className="text-[10px] text-neutral-500 italic">Ghi chú: {step.note}</p>
      )}

      {isDone ? (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold">
            {completedBy?.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(completedBy.user.avatarUrl)} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : myAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(myAvatarUrl)} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-emerald-200 flex items-center justify-center text-[10px]">
                {(completedByLabel ?? 'B').charAt(0).toUpperCase()}
              </span>
            )}
            <span>{completedByLabel} đã xong</span>
          </div>
          {/* Khâu QC: ảnh phải được TỔ CHỨC duyệt thì khâu 4 mới mở */}
          {isQCStep && step.reviewStatus === 'pending' && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] font-bold text-amber-800 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">hourglass_top</span>
              Chờ tổ chức duyệt ảnh
            </p>
          )}
          {isQCStep && step.reviewStatus === 'approved' && (
            <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              Tổ chức đã duyệt ảnh
            </p>
          )}
        </>
      ) : isLocked ? (
        <p className="text-[11px] text-neutral-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          {awaitingQcReview
            ? 'Chờ tổ chức duyệt ảnh QC'
            : !prevStepDone
              ? 'Chờ khâu trước hoàn thành'
              : `Chờ đến ${step.scheduledTime}`}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 mt-1">
          {/* Khâu QC bị tổ chức từ chối → hiện lý do để chef chỉnh và chụp lại */}
          {isQCStep && step.reviewStatus === 'rejected' && (
            <p className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1.5 text-[11px] font-semibold text-rose-700">
              Tổ chức từ chối ảnh QC{step.reviewNote ? `: ${step.reviewNote}` : ''} — kiểm tra lại món và chụp ảnh mới.
            </p>
          )}
          <button
            type="button"
            onClick={onTick}
            disabled={pending || !canAct}
            className={`w-full py-2 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              isQCStep ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isQCStep ? 'fact_check' : 'photo_camera'}
            </span>
            {pending ? 'Đang upload…' : isQCStep ? 'Kiểm tra & xác nhận' : 'Chụp ảnh & xác nhận'}
          </button>
        </div>
      )}
    </li>
  );
}
