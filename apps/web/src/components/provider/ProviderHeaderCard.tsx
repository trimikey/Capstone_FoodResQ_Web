'use client';

/* Hallmark · component: header-card · genre: editorial · theme: studio
 * purpose: sticky page header with title, optional breadcrumb, optional CTA + description
 */

import Link from 'next/link';

export interface Crumb {
  href?: string;
  label: string;
}

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  crumbs?: Crumb[];
  cta?: React.ReactNode;
  meta?: React.ReactNode;
}

export default function ProviderHeaderCard({ eyebrow, title, description, crumbs, cta, meta }: Props) {
  return (
    <header className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden">
      <div className="px-6 md:px-8 py-6 md:py-7 flex flex-col gap-5">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-bold">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="material-symbols-outlined text-[12px] text-neutral-300">chevron_right</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-emerald-700 transition-colors">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-neutral-700">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
            )}
            <h1 className="mt-1.5 text-2xl md:text-[28px] leading-tight font-extrabold text-neutral-900">
              {title}
            </h1>
            {description && <p className="mt-2 text-sm text-neutral-500 max-w-2xl">{description}</p>}
            {meta && <div className="mt-3">{meta}</div>}
          </div>
          {cta && <div className="shrink-0 flex flex-wrap items-center gap-2">{cta}</div>}
        </div>
      </div>
    </header>
  );
}
