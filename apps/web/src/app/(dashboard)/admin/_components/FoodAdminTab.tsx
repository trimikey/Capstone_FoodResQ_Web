'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAdminFoodListings, useUpdateListingCategory } from '@/hooks/useAdmin';
import { UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit, FoodCategory, FoodGroup, FOOD_CATEGORY_LABEL, FOOD_GROUP_LABEL, FOOD_GROUP_CATEGORIES } from '@foodresq/types';
import { Skeleton, Empty, Pagination } from './admin-shared';

const LISTING_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-neutral-100 text-neutral-600' },
  active: { label: 'Đang mở', cls: 'bg-emerald-100 text-emerald-800' },
  fully_reserved: { label: 'Hết suất', cls: 'bg-honey-100 text-honey-800' },
  completed: { label: 'Hoàn tất', cls: 'bg-sky-100 text-sky-700' },
  expired: { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-500' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700' },
};

const FOOD_GROUP_TABS: { v: string; l: string }[] = [
  { v: '', l: 'Tất cả nhóm' },
  { v: FoodGroup.READY_TO_EAT, l: FOOD_GROUP_LABEL[FoodGroup.READY_TO_EAT] },
  { v: FoodGroup.RAW_INGREDIENT, l: FOOD_GROUP_LABEL[FoodGroup.RAW_INGREDIENT] },
  { v: FoodGroup.OTHER, l: FOOD_GROUP_LABEL[FoodGroup.OTHER] },
];

export default function FoodAdminTab() {
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminFoodListings({
    page,
    group: group || undefined,
    status: status || undefined,
    search: search.trim() || undefined,
  });
  const update = useUpdateListingCategory();

  function resetTo1<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  async function changeCategory(id: string, category: string) {
    try {
      await update.mutateAsync({ id, category });
      toast.success(`Đã đổi loại sang "${FOOD_CATEGORY_LABEL[category as FoodCategory]}"`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Đổi loại thất bại';
      toast.error(msg);
    }
  }

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý thức ăn</h2>
        <p className="text-sm text-neutral-500 mt-1">Xem và phân loại lại các tin thực phẩm theo nhóm ăn liền / nguyên liệu thô.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FOOD_GROUP_TABS.map((g) => (
          <button key={g.v} onClick={() => resetTo1(setGroup)(g.v)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${group === g.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
            {g.l}
          </button>
        ))}
        <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => resetTo1(setStatus)(e.target.value)}
            className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
            <option value="">Mọi trạng thái</option>
            {Object.entries(LISTING_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
          <div className="relative">
            <span className="material-symbols-outlined text-[18px] text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input value={search} onChange={(e) => resetTo1(setSearch)(e.target.value)} placeholder="Tìm tên món..."
              className="bg-white border border-neutral-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 w-full sm:w-44" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <Empty icon="restaurant_menu" text="Không có tin thực phẩm nào" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[760px]">
              <thead className="text-neutral-500 font-semibold text-[13px]">
                <tr>
                  <th className="px-6 py-4 w-[34%]">Món</th>
                  <th className="px-6 py-4">Nhà cung cấp</th>
                  <th className="px-6 py-4">Số lượng</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Phân loại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {items.map((it) => {
                  const st = LISTING_STATUS_META[it.status] ?? { label: it.status, cls: 'bg-neutral-100 text-neutral-600' };
                  return (
                    <tr key={it.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="min-w-0">
                          <p className="font-bold text-neutral-900 truncate">{it.title}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5">{it.groupLabel}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-neutral-600 truncate max-w-[160px]">{it.businessName ?? '—'}</td>
                      <td className="px-6 py-4 text-neutral-600 whitespace-nowrap">{it.quantityRemaining}/{it.quantityTotal} {UNIT_LABEL[it.quantityUnit as QuantityUnit] ?? it.quantityUnit}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <select value={it.category} disabled={update.isPending}
                          onChange={(e) => changeCategory(it.id, e.target.value)}
                          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer max-w-[230px]">
                          <optgroup label={FOOD_GROUP_LABEL[FoodGroup.READY_TO_EAT]}>
                            {FOOD_GROUP_CATEGORIES[FoodGroup.READY_TO_EAT].map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>)}
                          </optgroup>
                          <optgroup label={FOOD_GROUP_LABEL[FoodGroup.RAW_INGREDIENT]}>
                            {FOOD_GROUP_CATEGORIES[FoodGroup.RAW_INGREDIENT].map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>)}
                          </optgroup>
                          <optgroup label={FOOD_GROUP_LABEL[FoodGroup.OTHER]}>
                            {FOOD_GROUP_CATEGORIES[FoodGroup.OTHER].map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>)}
                          </optgroup>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} perPage={meta.limit} onChange={setPage} />}
        </div>
      )}
    </div>
  );
}
