'use client';

import { useAdminOverview, useRecentReservations } from '@/hooks/useAdmin';
import { mediaUrl, UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import { RES_STATUS_META, usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const CAT_ICON: Record<string, string> = {
  cooked_meal: 'restaurant', bakery: 'bakery_dining', fresh_fruit: 'nutrition', beverage: 'local_cafe',
  vegetables: 'eco', raw_protein: 'set_meal', dry_goods: 'grain', canned_packaged: 'inventory_2', other: 'lunch_dining',
};

function DonStat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-white border border-neutral-150 rounded-3xl p-6 shadow-sm flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-[#f0fdf4] text-emerald-600 flex items-center justify-center">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-black text-neutral-500 tracking-widest uppercase">{label}</p>
        <p className="text-xl font-extrabold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

export default function DonationsTab() {
  const { data: ov } = useAdminOverview();
  const { data: rows, isLoading } = useRecentReservations(50);
  const paged = usePaged(rows ?? [], 8);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý Quyên góp</h2>
        <p className="text-sm text-neutral-500 mt-1">Theo dõi nguồn thực phẩm hỗ trợ cộng đồng (số liệu thật).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <DonStat icon="assignment" label="Đã xác nhận" value={ov?.donations.confirmed ?? 0} />
        <DonStat icon="hourglass_top" label="Chờ bàn giao" value={ov?.donations.pickedUp ?? 0} />
        <DonStat icon="check_circle" label="Hoàn thành" value={ov?.donations.completed ?? 0} />
        <div className="bg-[#166534] rounded-3xl p-6 shadow-sm flex items-center gap-4 text-white">
          <div className="w-12 h-12 rounded-xl bg-[#14532d] text-emerald-100 flex items-center justify-center">
            <span className="material-symbols-outlined">kitchen</span>
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-200 tracking-widest uppercase">Tổng khối lượng</p>
            <p className="text-xl font-extrabold text-white">{(ov?.kgRescued ?? 0).toLocaleString('vi-VN')} kg</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
        <div className="p-4 flex items-center gap-3 pl-4">
          <span className="material-symbols-outlined text-emerald-700">list_alt</span>
          <h3 className="font-bold text-lg text-neutral-900">Đơn nhận gần đây</h3>
        </div>
        {isLoading ? (
          <div className="p-4"><Skeleton /></div>
        ) : !rows || rows.length === 0 ? (
          <Empty icon="inbox" text="Chưa có đơn nhận nào" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm mt-2 min-w-[640px]">
                <thead className="text-neutral-500 font-semibold text-[13px]">
                  <tr>
                    <th className="px-6 py-4 font-semibold w-[34%]">Thực phẩm</th>
                    <th className="px-6 py-4 font-semibold">Số lượng</th>
                    <th className="px-6 py-4 font-semibold">Người nhận</th>
                    <th className="px-6 py-4 font-semibold">Ngày</th>
                    <th className="px-6 py-4 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100/50">
                  {paged.slice.map((r) => {
                    const st = RES_STATUS_META[r.status] ?? { label: r.status, cls: 'bg-neutral-100 text-neutral-600', icon: 'help' };
                    return (
                      <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-[#f0fdf4] flex items-center justify-center text-emerald-700 shrink-0">
                              <span className="material-symbols-outlined text-[20px]">{CAT_ICON[r.category] ?? 'lunch_dining'}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900 truncate">{r.title}</p>
                              <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{r.provider}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-neutral-100 px-4 py-1.5 rounded-full text-xs font-bold text-neutral-700 whitespace-nowrap">{r.quantity} {UNIT_LABEL[r.quantityUnit as QuantityUnit] ?? r.quantityUnit}</span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-neutral-800 truncate max-w-[160px]">{r.receiver}</td>
                        <td className="px-6 py-4 text-neutral-600 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit ${st.cls}`}>
                            <span className="material-symbols-outlined text-[14px]">{st.icon}</span>{st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
          </>
        )}
      </div>
    </div>
  );
}
