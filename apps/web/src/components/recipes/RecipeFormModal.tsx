'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { RecipeDifficulty } from '@foodresq/types';
import {
  useCreateRecipe,
  useUpdateRecipe,
  useUploadRecipeImage,
  type RecipeDetail,
  type RecipeIngredient,
  type RecipeInput,
} from '@/hooks/useRecipes';
import { mediaUrl } from '@/lib/utils';

function errMsg(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

const DIFFICULTY_OPTS: { value: RecipeDifficulty; label: string }[] = [
  { value: RecipeDifficulty.EASY, label: 'Dễ' },
  { value: RecipeDifficulty.MEDIUM, label: 'Trung bình' },
  { value: RecipeDifficulty.HARD, label: 'Khó' },
];

export default function RecipeFormModal({
  existing,
  onClose,
}: {
  existing?: RecipeDetail;
  onClose: () => void;
}) {
  const editing = !!existing;
  const create = useCreateRecipe();
  const update = useUpdateRecipe();
  const uploadImage = useUploadRecipeImage();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [servings, setServings] = useState(String(existing?.servings ?? ''));
  const [prep, setPrep] = useState(String(existing?.prepMinutes ?? ''));
  const [cook, setCook] = useState(String(existing?.cookMinutes ?? ''));
  const [difficulty, setDifficulty] = useState<RecipeDifficulty>(existing?.difficulty ?? RecipeDifficulty.MEDIUM);
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(existing?.imageUrls ?? []);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    existing?.ingredients?.length ? existing.ingredients : [{ name: '', quantity: '', unit: '' }],
  );

  const busy = create.isPending || update.isPending;

  function setIng(i: number, patch: Partial<RecipeIngredient>) {
    setIngredients((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function onPickImage(file?: File) {
    if (!file) return;
    try {
      const { url } = await uploadImage.mutateAsync(file);
      setImageUrls((arr) => [...arr, url]);
    } catch (e) {
      toast.error(errMsg(e, 'Tải ảnh thất bại'));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) {
      toast.error('Tên món cần ít nhất 3 ký tự.');
      return;
    }
    const cleanIngredients = ingredients
      .map((x) => ({ ...x, name: x.name.trim() }))
      .filter((x) => x.name.length > 0);

    const input: RecipeInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      servings: servings ? Number(servings) : 0,
      prepMinutes: prep ? Number(prep) : undefined,
      cookMinutes: cook ? Number(cook) : undefined,
      difficulty,
      instructions: instructions.trim() || undefined,
      imageUrls,
      ingredients: cleanIngredients,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: existing!.id, input });
        toast.success('Đã cập nhật công thức.');
      } else {
        await create.mutateAsync(input);
        toast.success('Đã thêm công thức vào thư viện.');
      }
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Lưu công thức thất bại'));
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-neutral-150 w-full max-w-lg my-8 elevation-3 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-gradient px-6 py-5 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined">menu_book</span>
            <div className="min-w-0">
              <h3 className="font-extrabold text-lg truncate">{editing ? 'Sửa công thức' : 'Công thức mới'}</h3>
              <p className="text-xs text-white/80">Đóng góp vào thư viện bếp ăn</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          <div>
            <label className="text-xs font-bold text-neutral-500">Tên món *</label>
            <input className="input-base mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Cơm thịt kho tàu" />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-500">Mô tả</label>
            <textarea className="input-base mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-500">Khẩu phần</label>
              <input type="number" min={0} className="input-base mt-1" value={servings} onChange={(e) => setServings(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-500">Sơ chế (phút)</label>
              <input type="number" min={0} className="input-base mt-1" value={prep} onChange={(e) => setPrep(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-500">Nấu (phút)</label>
              <input type="number" min={0} className="input-base mt-1" value={cook} onChange={(e) => setCook(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-500">Độ khó</label>
            <div className="flex gap-2 mt-1">
              {DIFFICULTY_OPTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setDifficulty(o.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    difficulty === o.value
                      ? 'bg-honey-500 text-white border-honey-500'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nguyên liệu */}
          <div>
            <label className="text-xs font-bold text-neutral-500">Nguyên liệu</label>
            <div className="space-y-2 mt-1">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input-base flex-1 !py-1.5 text-sm" placeholder="Tên nguyên liệu" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} />
                  <input className="input-base w-16 !py-1.5 text-sm" placeholder="SL" value={ing.quantity ?? ''} onChange={(e) => setIng(i, { quantity: e.target.value })} />
                  <input className="input-base w-16 !py-1.5 text-sm" placeholder="ĐV" value={ing.unit ?? ''} onChange={(e) => setIng(i, { unit: e.target.value })} />
                  <button type="button" onClick={() => setIngredients((arr) => arr.filter((_, idx) => idx !== i))} className="text-neutral-300 hover:text-rose-500">
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setIngredients((arr) => [...arr, { name: '', quantity: '', unit: '' }])} className="mt-2 text-xs font-bold text-emerald-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">add</span> Thêm nguyên liệu
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-500">Các bước thực hiện</label>
            <textarea className="input-base mt-1" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={'1. Sơ chế...\n2. Kho thịt...'} />
          </div>

          {/* Ảnh */}
          <div>
            <label className="text-xs font-bold text-neutral-500">Ảnh món</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {imageUrls.map((u) => (
                <div key={u} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(u)} alt="" className="w-16 h-16 rounded-xl object-cover border border-neutral-200" />
                  <button type="button" onClick={() => setImageUrls((arr) => arr.filter((x) => x !== u))} className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center cursor-pointer text-neutral-400 hover:bg-neutral-50">
                <span className="material-symbols-outlined">add_a_photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <button type="submit" disabled={busy} className="w-full py-2.5 bg-brand-gradient text-white rounded-xl font-bold disabled:opacity-50">
            {busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm công thức'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
