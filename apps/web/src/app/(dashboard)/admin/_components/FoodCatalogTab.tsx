'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useFoodCatalog,
  useCreateFoodCategory,
  useUpdateFoodCategory,
  useDeleteFoodCategory,
  useCreateFoodCatalogItem,
  useUpdateFoodCatalogItem,
  useDeleteFoodCatalogItem,
  type FoodCatalogCategory,
} from '@/hooks/useAdmin';
import { errMsg } from '@/lib/utils';

/**
 * Danh mục thực phẩm — cây 2 cấp do admin tự quản lý.
 *
 *   NHÓM  "Đồ hộp / đóng gói"  →  LOẠI  "Đồ hộp móp méo", "Đồ hộp cận date"
 *   NHÓM  "Trái cây tươi"      →  LOẠI  "Chuối", "Nho"
 *
 * Khác tab "Quản lý thức ăn" (liệt kê TIN ĐĂNG của từng NCC) — ở đây là danh mục
 * dùng chung, không gắn với nhà cung cấp nào.
 */

const GROUPS = [
  { value: 'ready_to_eat', label: 'Thực phẩm ăn liền', icon: 'restaurant', tone: 'emerald' },
  { value: 'raw_ingredient', label: 'Nguyên liệu thô', icon: 'agriculture', tone: 'honey' },
  { value: 'other', label: 'Khác', icon: 'more_horiz', tone: 'neutral' },
] as const;

const GROUP_LABEL: Record<string, string> = Object.fromEntries(
  GROUPS.map((g) => [g.value, g.label]),
);

export default function FoodCatalogTab() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useFoodCatalog(search.trim() || undefined);

  const createCategory = useCreateFoodCategory();
  const updateCategory = useUpdateFoodCategory();
  const deleteCategory = useDeleteFoodCategory();

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', group: 'ready_to_eat', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: '', group: '', description: '' });

  const categories = data?.categories ?? [];

  async function handleCreateCategory() {
    if (newCategory.name.trim().length < 2) {
      toast.error('Tên nhóm tối thiểu 2 ký tự.');
      return;
    }
    try {
      await createCategory.mutateAsync({
        name: newCategory.name.trim(),
        group: newCategory.group,
        description: newCategory.description.trim() || undefined,
      });
      toast.success(`Đã tạo nhóm "${newCategory.name.trim()}"`);
      setNewCategory({ name: '', group: newCategory.group, description: '' });
      setShowNewCategory(false);
    } catch (e) {
      toast.error(errMsg(e, 'Tạo nhóm thất bại'));
    }
  }

  async function handleSaveCategory(id: string) {
    try {
      await updateCategory.mutateAsync({
        id,
        name: categoryDraft.name.trim(),
        group: categoryDraft.group,
        description: categoryDraft.description,
      });
      toast.success('Đã lưu nhóm.');
      setEditingCategoryId(null);
    } catch (e) {
      toast.error(errMsg(e, 'Lưu nhóm thất bại'));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold tracking-tight text-neutral-900">
            Danh mục thực phẩm
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Tạo nhóm và các loại thực phẩm chi tiết bên trong. Ví dụ nhóm{' '}
            <b>Đồ hộp / đóng gói</b> chứa <b>Đồ hộp móp méo</b>, nhóm <b>Trái cây tươi</b> chứa{' '}
            <b>Chuối</b>, <b>Nho</b>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewCategory((v) => !v)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#166534] px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#14532d]"
        >
          <span className="material-symbols-outlined text-[20px]">
            {showNewCategory ? 'close' : 'create_new_folder'}
          </span>
          {showNewCategory ? 'Đóng' : 'Tạo nhóm mới'}
        </button>
      </div>

      {/* Form tạo nhóm */}
      {showNewCategory && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-5">
          <p className="mb-3 text-sm font-extrabold text-neutral-800">Nhóm thực phẩm mới</p>
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1.4fr_auto]">
            <input
              autoFocus
              value={newCategory.name}
              onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tên nhóm — VD: Đồ hộp / đóng gói"
              maxLength={120}
              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <select
              value={newCategory.group}
              onChange={(e) => setNewCategory((p) => ({ ...p, group: e.target.value }))}
              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              {GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <input
              value={newCategory.description}
              onChange={(e) => setNewCategory((p) => ({ ...p, description: e.target.value }))}
              placeholder="Mô tả (tuỳ chọn)"
              maxLength={500}
              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={createCategory.isPending}
              className="rounded-xl bg-[#166534] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#14532d] disabled:opacity-50"
            >
              {createCategory.isPending ? 'Đang tạo…' : 'Tạo nhóm'}
            </button>
          </div>
        </div>
      )}

      {/* Tìm kiếm + tổng quan */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-neutral-400">
            search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm loại thực phẩm…"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-600">
          {data?.totalCategories ?? 0} nhóm · {data?.totalItems ?? 0} loại
        </span>
      </div>

      {/* Danh sách nhóm */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-12 text-center">
          <span className="material-symbols-outlined text-[44px] text-neutral-300">category</span>
          <p className="mt-2 font-bold text-neutral-700">
            {search ? 'Không tìm thấy loại nào khớp' : 'Chưa có nhóm nào'}
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            {search ? 'Thử từ khoá khác.' : 'Bấm "Tạo nhóm mới" để bắt đầu.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              isEditing={editingCategoryId === cat.id}
              draft={categoryDraft}
              onDraftChange={setCategoryDraft}
              onStartEdit={() => {
                setEditingCategoryId(cat.id);
                setCategoryDraft({
                  name: cat.name,
                  group: cat.group,
                  description: cat.description ?? '',
                });
              }}
              onCancelEdit={() => setEditingCategoryId(null)}
              onSaveEdit={() => handleSaveCategory(cat.id)}
              saving={updateCategory.isPending}
              onDelete={async () => {
                try {
                  const r = (await deleteCategory.mutateAsync(cat.id)) as { itemsDeleted?: number };
                  toast.success(
                    r?.itemsDeleted
                      ? `Đã xoá nhóm "${cat.name}" và ${r.itemsDeleted} loại bên trong.`
                      : `Đã xoá nhóm "${cat.name}".`,
                  );
                } catch (e) {
                  toast.error(errMsg(e, 'Xoá nhóm thất bại'));
                }
              }}
              onToggleActive={async () => {
                try {
                  await updateCategory.mutateAsync({ id: cat.id, isActive: !cat.isActive });
                  toast.success(cat.isActive ? 'Đã tắt nhóm.' : 'Đã bật lại nhóm.');
                } catch (e) {
                  toast.error(errMsg(e, 'Cập nhật thất bại'));
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  isEditing,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  saving,
  onDelete,
  onToggleActive,
}: {
  cat: FoodCatalogCategory;
  isEditing: boolean;
  draft: { name: string; group: string; description: string };
  onDraftChange: (d: { name: string; group: string; description: string }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  saving: boolean;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createItem = useCreateFoodCatalogItem();
  const updateItem = useUpdateFoodCatalogItem();
  const deleteItem = useDeleteFoodCatalogItem();

  async function addItem() {
    if (newItem.trim().length < 2) {
      toast.error('Tên loại tối thiểu 2 ký tự.');
      return;
    }
    try {
      await createItem.mutateAsync({ categoryId: cat.id, name: newItem.trim() });
      toast.success(`Đã thêm "${newItem.trim()}" vào ${cat.name}`);
      setNewItem('');
    } catch (e) {
      toast.error(errMsg(e, 'Thêm loại thất bại'));
    }
  }

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
        cat.isActive ? 'border-neutral-150' : 'border-neutral-200 opacity-70'
      }`}
    >
      {/* Header nhóm */}
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-100 bg-neutral-50/60 px-5 py-3.5">
        {isEditing ? (
          <>
            <input
              value={draft.name}
              onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
              className="min-w-[160px] flex-1 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-sm font-bold outline-none"
            />
            <select
              value={draft.group}
              onChange={(e) => onDraftChange({ ...draft, group: e.target.value })}
              className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none"
            >
              {GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <input
              value={draft.description}
              onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              placeholder="Mô tả"
              className="min-w-[160px] flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={saving}
              className="rounded-lg bg-[#166534] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Lưu
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600"
            >
              Huỷ
            </button>
          </>
        ) : (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0fdf4] text-emerald-700">
              <span className="material-symbols-outlined text-[20px]">folder</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-extrabold text-neutral-900">
                {cat.name}
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500">
                  {GROUP_LABEL[cat.group] ?? cat.group}
                </span>
                {!cat.isActive && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    Đã tắt
                  </span>
                )}
              </p>
              {cat.description && (
                <p className="truncate text-xs text-neutral-500">{cat.description}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              {cat.itemCount} loại
            </span>
            <button
              type="button"
              onClick={onStartEdit}
              className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-bold text-neutral-600 hover:bg-white"
            >
              Sửa
            </button>
            <button
              type="button"
              onClick={onToggleActive}
              className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-bold text-neutral-600 hover:bg-white"
            >
              {cat.isActive ? 'Tắt' : 'Bật'}
            </button>
            {confirmDelete ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Xoá cả {cat.itemCount} loại
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-bold text-neutral-600"
                >
                  Thôi
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="shrink-0 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
              >
                Xoá
              </button>
            )}
          </>
        )}
      </header>

      {/* Các loại trong nhóm */}
      <div className="p-4">
        {cat.items.length === 0 ? (
          <p className="mb-3 text-xs italic text-neutral-400">
            Nhóm này chưa có loại nào — thêm ở ô bên dưới.
          </p>
        ) : (
          <ul className="mb-3 flex flex-wrap gap-2">
            {cat.items.map((it) => (
              <li
                key={it.id}
                className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                  it.isActive
                    ? 'border-neutral-200 bg-white text-neutral-800'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-400 line-through'
                }`}
                title={it.description ?? undefined}
              >
                <span className="font-semibold">{it.name}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await updateItem.mutateAsync({ id: it.id, isActive: !it.isActive });
                    } catch (e) {
                      toast.error(errMsg(e, 'Cập nhật thất bại'));
                    }
                  }}
                  className="text-neutral-300 transition-colors hover:text-amber-600"
                  title={it.isActive ? 'Tắt loại này' : 'Bật lại'}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {it.isActive ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await deleteItem.mutateAsync(it.id);
                      toast.success(`Đã xoá "${it.name}"`);
                    } catch (e) {
                      toast.error(errMsg(e, 'Xoá thất bại'));
                    }
                  }}
                  className="text-neutral-300 transition-colors hover:text-rose-600"
                  title="Xoá loại này"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              // Enter để thêm nhanh nhiều loại liên tiếp, khỏi rê chuột từng cái.
              if (e.key === 'Enter') {
                e.preventDefault();
                void addItem();
              }
            }}
            placeholder={`Thêm loại vào "${cat.name}" — VD: Đồ hộp móp méo`}
            maxLength={255}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={createItem.isPending}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Thêm
          </button>
        </div>
      </div>
    </section>
  );
}
