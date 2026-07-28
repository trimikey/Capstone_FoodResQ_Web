'use client';

import Link from 'next/link';
import { useCompletedCampaigns, type CompletedCampaign } from '@/hooks/useCampaigns';
import { mediaUrl } from '@/lib/utils';

export default function CompletedCampaignsSection() {
  const { data } = useCompletedCampaigns();
  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="space-y-3 pt-2">
      <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-500">workspace_premium</span>
        Câu chuyện thành công
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((c) => (
          <CompletedCampaignCard key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

function CompletedCampaignCard({ c }: { c: CompletedCampaign }) {
  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="cm-card block overflow-hidden group"
    >
      <div className="relative h-36">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : '/vn-pho.jpg'}
          alt={c.title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-amber-400/95 text-amber-950 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <span className="material-symbols-outlined text-[13px]">verified</span> Đã hoàn thành
        </span>
        <h3 className="absolute bottom-3 left-3 right-3 font-extrabold text-white text-base leading-snug line-clamp-2">
          {c.title}
        </h3>
      </div>
      <div className="p-4">
        <p className="text-xs text-neutral-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {new Date(c.scheduledDate).toLocaleDateString('vi-VN')}
          {c.organizationName ? ` · ${c.organizationName}` : ''}
        </p>
        <div className="flex flex-wrap gap-3 mt-2.5 text-xs">
          {(c.actualServings != null || c.peopleServed > 0) && (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
              <span className="material-symbols-outlined text-[15px]">restaurant</span>
              {c.actualServings ?? 0} suất
            </span>
          )}
          {c.peopleServed > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-sky-700">
              <span className="material-symbols-outlined text-[15px]">diversity_3</span>
              {c.peopleServed} người
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-bold text-honey-700">
            <span className="material-symbols-outlined text-[15px]">volunteer_activism</span>
            {c.volunteers} TNV
          </span>
          {c.experienceCount > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-neutral-500">
              <span className="material-symbols-outlined text-[15px]">format_quote</span>
              {c.experienceCount} cảm nhận
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}