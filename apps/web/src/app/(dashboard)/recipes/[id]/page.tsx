'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RecipeDifficulty, UserRole } from '@foodresq/types';
import { useRecipe, useDeleteRecipe } from '@/hooks/useRecipes';
import { useAuthStore } from '@/stores/auth.store';
import { mediaUrl, errMsg } from '@/lib/utils';
import RecipeFormModal from '@/components/recipes/RecipeFormModal';


const DIFFICULTY_LABEL: Record<RecipeDifficulty, string> = {
  [RecipeDifficulty.EASY]: 'Dễ',
  [RecipeDifficulty.MEDIUM]: 'Trung bình',
  [RecipeDifficulty.HARD]: 'Khó',
};

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: recipe, isLoading } = useRecipe(id);
  const del = useDeleteRecipe();
  const [editing, setEditing] = useState(false);

  const canEdit = !!recipe && !!user && (user.role === UserRole.ADMIN || recipe.createdByUserId === user.id);

  async function onDelete() {
    if (!recipe || !confirm('Xoá công thức này?')) return;
    try {
      await del.mutateAsync(recipe.id);
      toast.success('Đã xoá công thức.');
      router.push('/recipes');
    } catch (e) {
      toast.error(errMsg(e, 'Xoá thất bại'));
    }
  }

  if (isLoading) return <p className="text-center text-neutral-400 py-12">Đang tải…</p>;
  if (!recipe) return <p className="text-center text-neutral-400 py-12">Không tìm thấy công thức.</p>;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 md:px-6 py-5">
      <button onClick={() => router.back()} className="text-sm text-neutral-500 flex items-center gap-1 mb-3">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> Quay lại
      </button>

      {recipe.imageUrls[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(recipe.imageUrls[0])} alt={recipe.name} className="w-full h-52 object-cover rounded-2xl mb-4 border border-neutral-150" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-800">{recipe.name}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">Đóng góp bởi {recipe.createdBy.fullName}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditing(true)} className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50">
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
            <button onClick={onDelete} disabled={del.isPending} className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        )}
      </div>

      {recipe.description && <p className="text-neutral-600 mt-3">{recipe.description}</p>}

      <div className="grid grid-cols-4 gap-2 mt-4">
        {[
          { icon: 'restaurant', label: 'Khẩu phần', value: recipe.servings || '—' },
          { icon: 'bolt', label: 'Độ khó', value: DIFFICULTY_LABEL[recipe.difficulty] },
          { icon: 'timer', label: 'Sơ chế', value: recipe.prepMinutes ? `${recipe.prepMinutes}'` : '—' },
          { icon: 'skillet', label: 'Nấu', value: recipe.cookMinutes ? `${recipe.cookMinutes}'` : '—' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-neutral-150 p-2.5 text-center">
            <span className="material-symbols-outlined text-[18px] text-honey-600">{s.icon}</span>
            <p className="text-sm font-bold text-neutral-800 leading-tight">{s.value}</p>
            <p className="text-[10px] text-neutral-400">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="font-bold text-neutral-800 flex items-center gap-1.5 mb-2">
          <span className="material-symbols-outlined text-[20px] text-emerald-600">grocery</span> Nguyên liệu
        </h2>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-neutral-400">Chưa có nguyên liệu.</p>
        ) : (
          <ul className="bg-white rounded-2xl border border-neutral-150 divide-y divide-neutral-100">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id ?? ing.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-neutral-700">{ing.name}</span>
                <span className="text-neutral-500 font-semibold">
                  {[ing.quantity, ing.unit].filter(Boolean).join(' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recipe.instructions && (
        <section className="mt-6">
          <h2 className="font-bold text-neutral-800 flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-[20px] text-sky-600">format_list_numbered</span> Cách làm
          </h2>
          <p className="bg-white rounded-2xl border border-neutral-150 p-4 text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">
            {recipe.instructions}
          </p>
        </section>
      )}

      {editing && <RecipeFormModal existing={recipe} onClose={() => setEditing(false)} />}
    </div>
  );
}
