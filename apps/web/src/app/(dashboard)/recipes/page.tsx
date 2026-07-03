'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RecipeDifficulty, UserRole } from '@foodresq/types';
import { useRecipes, useMyRecipes, type RecipeListItem } from '@/hooks/useRecipes';
import { useMe } from '@/hooks/useProfile';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { mediaUrl } from '@/lib/utils';
import RecipeFormModal from '@/components/recipes/RecipeFormModal';

const DIFFICULTY_META: Record<RecipeDifficulty, { label: string; badge: string }> = {
  [RecipeDifficulty.EASY]: { label: 'Dễ', badge: 'badge-emerald' },
  [RecipeDifficulty.MEDIUM]: { label: 'Trung bình', badge: 'badge-honey' },
  [RecipeDifficulty.HARD]: { label: 'Khó', badge: 'badge-rose' },
};

function RecipeCard({ r }: { r: RecipeListItem }) {
  const meta = DIFFICULTY_META[r.difficulty] ?? DIFFICULTY_META[RecipeDifficulty.MEDIUM];
  return (
    <Link
      href={`/recipes/${r.id}`}
      className="bg-white rounded-2xl border border-neutral-150 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className="h-32 bg-neutral-100 relative">
        {r.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(r.imageUrls[0])} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300">
            <span className="material-symbols-outlined text-[40px]">skillet</span>
          </div>
        )}
        <span className={`badge ${meta.badge} absolute top-2 left-2`}>{meta.label}</span>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-bold text-neutral-800 leading-tight line-clamp-2">{r.name}</h3>
        {r.description && <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{r.description}</p>}
        <div className="mt-auto pt-3 flex items-center gap-3 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">restaurant</span>{r.servings} suất
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">grocery</span>{r.ingredientCount}
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>Dùng {r.timesUsed}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function RecipesPage() {
  const { data: me } = useMe();
  const { data: vol } = useVolunteerMe(me?.role === UserRole.VOLUNTEER);
  const canAuthor =
    me?.role === UserRole.ADMIN ||
    (me?.role === UserRole.VOLUNTEER && (vol?.specializations ?? []).some((s) => s.specialization === 'chef'));

  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const all = useRecipes(search);
  const mine = useMyRecipes(mineOnly && canAuthor);
  const active = mineOnly ? mine : all;
  const items = active.data?.items ?? [];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-extrabold text-neutral-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-honey-600">menu_book</span> Thư viện công thức
        </h1>
        {canAuthor && (
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-gradient text-white rounded-xl font-bold text-sm flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined text-[18px]">add</span> Thêm
          </button>
        )}
      </div>
      <p className="text-sm text-neutral-500 mb-4">Công thức do các đầu bếp đóng góp, tái sử dụng cho chiến dịch bếp ăn.</p>

      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300 text-[20px]">search</span>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setMineOnly(false); }}
            placeholder="Tìm công thức theo tên…"
            className="input-base !pl-10"
          />
        </div>
        {canAuthor && (
          <button
            onClick={() => setMineOnly((v) => !v)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border whitespace-nowrap transition-colors ${
              mineOnly ? 'bg-honey-500 text-white border-honey-500' : 'bg-white text-neutral-600 border-neutral-200'
            }`}
          >
            Của tôi
          </button>
        )}
      </div>

      {active.isLoading ? (
        <p className="text-center text-neutral-400 py-12">Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="text-center text-neutral-400 py-16">
          <span className="material-symbols-outlined text-[48px]">menu_book</span>
          <p className="mt-2">{mineOnly ? 'Bạn chưa có công thức nào.' : 'Chưa có công thức nào.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((r) => <RecipeCard key={r.id} r={r} />)}
        </div>
      )}

      {showCreate && <RecipeFormModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
