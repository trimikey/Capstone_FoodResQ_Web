'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useManageContext } from '../../../_components/ManageShell';
import AddSupplyModal from '../../../_components/AddSupplyModal';
import { useSetMenuItemMeal } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

type MealTab = 'breakfast' | 'lunch' | 'dinner';
const MEAL_TABS: Array<{ key: MealTab; label: string; icon: string }> = [
  { key: 'breakfast', label: 'Bữa sáng', icon: 'free_breakfast' },
  { key: 'lunch', label: 'Bữa trưa', icon: 'rice_bowl' },
  { key: 'dinner', label: 'Bữa tối', icon: 'dinner_dining' },
];

const NUTRITION_TAGS = ['High Protein', 'Ít đường', 'Vitamins', 'GLUTEN-FREE', 'Lactose-Free'];

/** Số vật phẩm hiện sẵn khi thu gọn — còn lại ẩn sau nút "Xem tất cả". */
const SUPPLY_PREVIEW_COUNT = 5;

export default function MenuPage() {
  const { campaign: c } = useManageContext();
  const [meal, setMeal] = useState<MealTab>('lunch');
  const [addSupplyOpen, setAddSupplyOpen] = useState(false);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  // Danh sách vật phẩm có thể rất dài — mặc định thu gọn, bấm "Xem tất cả" mới xổ hết.
  const [showAllSupplies, setShowAllSupplies] = useState(false);
  const setMealMutation = useSetMenuItemMeal();

  async function assignMeal(index: number, type: string) {
    if (!type || !c) return;
    try {
      await setMealMutation.mutateAsync({ campaignId: c.id, index, type });
      const label = MEAL_TABS.find((t) => t.key === type)?.label ?? type;
      toast.success(`Đã chuyển món sang ${label.toLowerCase()}.`);
    } catch (e) {
      toast.error(errMsg(e, 'Không gán được bữa cho món này'));
    }
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function shareCampaign() {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/campaigns/${c!.id}`;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url).then(
        () => toast.success('Đã sao chép link chiến dịch — chia sẻ cho cộng đồng nhé!'),
        () => toast.info(url),
      );
    } else {
      toast.info(url);
    }
  }

  // Lọc món theo bữa. Món có `type` NGOÀI 3 bữa (dữ liệu cũ, hoặc nhập từ nguồn khác
  // với type kiểu 'main'/'soup') trước đây bị bỏ im lặng — thực đơn có món mà giao diện
  // báo "chưa có món nào". Gom chúng vào nhóm riêng để không mất món nào.
  const allItems = c?.menuItems ?? [];
  const itemsByMeal = useMemo(() => {
    // Giữ kèm vị trí trong mảng gốc: API gán bữa định danh món theo index, không có id.
    type Entry = (typeof allItems)[number] & { index: number };
    const map: Record<MealTab, Entry[]> = { breakfast: [], lunch: [], dinner: [] };
    const other: Entry[] = [];
    allItems.forEach((it, index) => {
      const entry = { ...it, index };
      if (it.type === 'breakfast' || it.type === 'lunch' || it.type === 'dinner') {
        map[it.type as MealTab].push(entry);
      } else {
        other.push(entry);
      }
    });
    return { ...map, other };
  }, [allItems]);

  const items = itemsByMeal[meal];
  const unassigned = itemsByMeal.other;

  // Vật phẩm cần chuẩn bị — lấy từ c.supplyItems (hỗ trợ cả string[] và object[])
  const supplies = useMemo(() => {
    const raw = c?.supplyItems ?? [];
    return raw.map((s, idx) => {
      if (typeof s === 'string') {
        return { id: `s-${idx}`, name: s, unit: '', pledged: 0, need: 0 };
      }
      return {
        id: `s-${idx}`,
        name: s.name,
        unit: s.unit ?? '',
        pledged: 0,
        need: s.quantity ?? 0,
      };
    });
  }, [c?.supplyItems]);

  const pledgeStats = useMemo(() => {
    const pledged = supplies.reduce((s, i) => s + i.pledged, 0);
    const need = supplies.reduce((s, i) => s + i.need, 0);
    return {
      pledged,
      need,
      pct: need > 0 ? Math.min(100, Math.round((pledged / need) * 100)) : 0,
      remaining: Math.max(0, need - pledged),
    };
  }, [supplies]);

  // Nguồn thực phẩm — tính từ c.donations thực
  const sourceData = useMemo(() => {
    const donations = c?.donations ?? [];
    const confirmed = donations.filter((d) => d.status === 'confirmed' || d.status === 'received').length;
    const total = donations.length;
    const donationPct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return {
      donationPct,
      purchasePct: 100 - donationPct,
      raw: total,
    };
  }, [c?.donations]);

  if (!c) return null;

  return (
    <>
    <div className="cm-manage-2col">
      {/* Main */}
      <div className="cm-manage-2col-main space-y-4">
        {/* Thực đơn trong ngày */}
        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3">
            <h2 className="cm-manage-card-title !mb-3">
              <span className="material-symbols-outlined">restaurant_menu</span>
              Thực đơn trong ngày
            </h2>

            <div className="cm-mini-tabs">
              {MEAL_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={meal === t.key}
                  onClick={() => setMeal(t.key)}
                  className={`cm-mini-tab inline-flex items-center gap-1.5 ${
                    meal === t.key ? '!bg-[#236c2a] !text-white !border-[#236c2a] ' : ''
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                  {t.label} ({itemsByMeal[t.key].length})
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5">
            {items.length === 0 ? (
              <div className="cm-mini-empty">
                <span className="material-symbols-outlined">restaurant</span>
                {unassigned.length > 0
                  ? 'Chưa có món nào gắn vào bữa này — xem mục “Chưa phân bữa” bên dưới.'
                  : 'Chưa có món nào cho bữa này trong chiến dịch.'}
              </div>
            ) : (
              <ul className="cm-menu-meal">
                {items.map((it, idx) => {
                  const tags = it.plannedServings ? ['High Protein'] : ['Món chính'];
                  return (
                    <li key={`${it.name}-${idx}`} className="cm-menu-meal-item">
                      <span className="cm-menu-meal-icon">
                        <span className="material-symbols-outlined text-[18px]">restaurant</span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="cm-menu-meal-name">{it.name}</p>
                        <div className="cm-menu-meal-tags">
                          {tags.map((tg) => (
                            <span key={tg} className="cm-nutri-chip cm-nutri-chip--emerald">
                              {tg}
                            </span>
                          ))}
                        </div>
                      </div>
                      {it.plannedServings != null && it.plannedServings > 0 && (
                        <span className="cm-menu-meal-cal">{it.plannedServings} suất</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Món không thuộc 3 bữa — vẫn phải thấy được, nếu không thì thực đơn
                có món mà giao diện báo trống và người dùng tưởng mất dữ liệu. */}
            {unassigned.length > 0 && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <p className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-amber-600">label_off</span>
                  Chưa phân bữa ({unassigned.length})
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Chọn bữa cho từng món để chúng hiện ở đúng tab bên trên.
                </p>
                <ul className="cm-menu-meal mt-2">
                  {unassigned.map((it) => (
                    <li key={`other-${it.index}`} className="cm-menu-meal-item">
                      <span className="cm-menu-meal-icon">
                        <span className="material-symbols-outlined text-[18px]">restaurant</span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="cm-menu-meal-name">{it.name || 'Món chưa có tên'}</p>
                        {it.type && (
                          <div className="cm-menu-meal-tags">
                            <span className="cm-nutri-chip">{it.type}</span>
                          </div>
                        )}
                      </div>
                      {it.plannedServings != null && it.plannedServings > 0 && (
                        <span className="cm-menu-meal-cal">{it.plannedServings} suất</span>
                      )}
                      <select
                        value=""
                        disabled={setMealMutation.isPending}
                        onChange={(e) => void assignMeal(it.index, e.target.value)}
                        className="ml-2 shrink-0 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-bold text-neutral-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
                        aria-label={`Chọn bữa cho ${it.name || 'món này'}`}
                      >
                        <option value="" disabled>
                          Chọn bữa
                        </option>
                        {MEAL_TABS.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Danh sách nguyên liệu */}
        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="cm-manage-card-title !mb-0">
              <span className="material-symbols-outlined">inventory_2</span>
              Vật phẩm cần chuẩn bị
            </h2>
            <button
              type="button"
              onClick={() => setAddSupplyOpen(true)}
              className="cm-manage-card-link inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Thêm
            </button>
          </div>
          <div className="px-5 pb-3">
            {supplies.length === 0 ? (
              <div className="cm-mini-empty">
                <span className="material-symbols-outlined">inventory_2</span>
                Chưa có vật phẩm nào được liệt kê.
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {(showAllSupplies ? supplies : supplies.slice(0, SUPPLY_PREVIEW_COUNT)).map((it) => (
                    <li key={it.id} className="cm-ingredient-row">
                      <div className="cm-ingredient-info">
                        <p className="cm-ingredient-name">{it.name}</p>
                        <p className="cm-ingredient-meta">
                          {it.need > 0
                            ? `Cần ${it.need}${it.unit ? ` ${it.unit}` : ''}`
                            : it.unit
                              ? `Đơn vị: ${it.unit}`
                              : 'Chưa ghi rõ số lượng'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {supplies.length > SUPPLY_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllSupplies((v) => !v)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-200 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showAllSupplies ? 'expand_less' : 'expand_more'}
                    </span>
                    {showAllSupplies
                      ? 'Thu gọn'
                      : `Xem tất cả ${supplies.length} vật phẩm (+${supplies.length - SUPPLY_PREVIEW_COUNT})`}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* Sidebar phải */}
      <aside className="cm-manage-2col-side space-y-4">
        {/* Mục tiêu quyên góp */}
        <section className="cm-manage-card text-center">
          <h3 className="cm-manage-card-title justify-center">
            <span className="material-symbols-outlined">volunteer_activism</span>
            Mục tiêu quyên góp hôm nay
          </h3>
          <div className="relative w-32 h-32 mx-auto mt-3">
            <DonutRing pct={pledgeStats.pct} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-display text-2xl font-extrabold text-emerald-700">
                {pledgeStats.pledged.toLocaleString('vi-VN')}
              </p>
              <p className="text-[10px] font-bold text-neutral-500 mt-1">
                / {pledgeStats.need.toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
          <p className="text-xs text-rose-700 mt-3 font-bold inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">priority_high</span>
            Còn thiếu {pledgeStats.remaining.toLocaleString('vi-VN')} phần
          </p>
          <button
            type="button"
            onClick={shareCampaign}
            className="cm-manage-cta-primary w-full mt-4 inline-flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            Chia sẻ để kêu gọi
          </button>
        </section>

        {/* Nguồn thực phẩm */}
        <section className="cm-manage-card">
          <h3 className="cm-manage-card-title">
            <span className="material-symbols-outlined">pie_chart</span>
            Nguồn thực phẩm
          </h3>
          {sourceData.raw === 0 ? (
            <p className="text-xs text-neutral-400 mt-3">Chưa có cam kết quyên góp nào.</p>
          ) : (
            <div className="flex items-center gap-4 mt-3">
              <div className="relative w-24 h-24 shrink-0">
                <SourceDonut
                  donationPct={sourceData.donationPct}
                  purchasePct={sourceData.purchasePct}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-neutral-500">{sourceData.raw} món</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <SourceLegend
                  color="#10B981"
                  label="Đã xác nhận"
                  pct={sourceData.donationPct}
                />
                <SourceLegend
                  color="#F97066"
                  label="Chờ xác nhận"
                  pct={sourceData.purchasePct}
                />
              </div>
            </div>
          )}
        </section>

        {/* Tags nutrition filter */}
        <section className="cm-manage-card">
          <h3 className="cm-manage-card-title">
            <span className="material-symbols-outlined">label</span>
            Tiêu chí dinh dưỡng
          </h3>
          <div className="cm-chip-row mt-3">
            {NUTRITION_TAGS.map((tag) => {
              const active = activeTags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={`cm-chip-toggle ${active ? '!bg-[#236c2a] !text-white !border-[#236c2a] ' : ''}`}
                >
                  {active && (
                    <span className="material-symbols-outlined text-[12px] mr-1">check</span>
                  )}
                  {tag}
                </button>
              );
            })}
          </div>
          {activeTags.size > 0 && (
            <p className="text-[10px] text-neutral-500 mt-2">
              Đã chọn {activeTags.size} tiêu chí — sẽ áp dụng khi tạo chiến dịch mới.
            </p>
          )}
          <p className="text-[10px] text-neutral-400 mt-3">
            <span className="material-symbols-outlined text-[12px] align-middle">info</span>{' '}
            Tiêu chí dinh dưỡng giúp lọc nhanh khi nhà hảo tâm chọn món phù hợp.
          </p>
        </section>
      </aside>
    </div>

    {addSupplyOpen && (
      <AddSupplyModal
        campaignId={c!.id}
        onClose={() => setAddSupplyOpen(false)}
      />
    )}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function DonutRing({ pct }: { pct: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(16, 185, 129, 0.12)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="#10B981"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      />
    </svg>
  );
}

function SourceDonut({ donationPct, purchasePct }: { donationPct: number; purchasePct: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const donationLen = c * (donationPct / 100);
  return (
    <svg viewBox="0 0 90 90" className="w-24 h-24 -rotate-90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="#F97066" strokeWidth="14" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke="#10B981"
        strokeWidth="14"
        strokeDasharray={`${donationLen} ${c - donationLen}`}
      />
    </svg>
  );
}

function SourceLegend({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ background: color }}
      />
      <span className="text-xs font-bold text-neutral-700 flex-1">{label}</span>
      <span className="text-xs font-extrabold text-neutral-900">{pct}%</span>
    </div>
  );
}
