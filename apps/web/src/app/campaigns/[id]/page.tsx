'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PublicHeader from '@/components/home/PublicHeader';
import {
  usePublicCampaignDetail,
  useApplyCampaign,
  useAddExperience,
  useUploadExperienceImage,
  type CampaignParticipant,
  type CampaignDistribution,
  type CampaignExperience,
  type CampaignProofPhoto,
} from '@/hooks/useCampaigns';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useAuthStore } from '@/stores/auth.store';
import { mediaUrl, errMsg } from '@/lib/utils';
import { StatTile } from '@/components/shared/StatTile';
import { AssignmentRole, UserRole } from '@foodresq/types';

const CAMPAIGN_FALLBACK = '/vn-pho.jpg';

const ROLE_META: Record<string, { label: string; icon: string }> = {
  chef: { label: 'Đầu bếp', icon: 'skillet' },
  waiter: { label: 'Phục vụ', icon: 'room_service' },
  shipper: { label: 'Giao hàng', icon: 'local_shipping' },
};

const PROOF_KIND: Record<string, string> = {
  ingredient: 'Nguyên liệu',
  cooked: 'Món đã nấu',
  distribution: 'Trao suất ăn',
};


export default function CampaignPublicDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const router = useRouter();

  const { data: c, isLoading, isError } = usePublicCampaignDetail(id);
  const user = useAuthStore((s) => s.user);
  const isVolunteer = user?.role === UserRole.VOLUNTEER;
  const { data: vol } = useVolunteerMe(isVolunteer);
  const apply = useApplyCampaign();
  const [picking, setPicking] = useState(false);

  const myRoles = (vol?.specializations ?? []).map((s) => s.specialization);
  const isCompleted = c?.status === 'completed';
  // Đã qua ngày diễn ra (hết ngày tổ chức) → không còn nhận đăng ký
  const isPast = c ? new Date(c.scheduledDate).setHours(23, 59, 59, 999) < Date.now() : false;
  const canRegister = !isCompleted && !isPast;

  const slots = c
    ? (['chef', 'waiter', 'shipper'] as AssignmentRole[]).map((role) => ({
        role,
        needed: c[`${role}SlotsNeeded` as const],
        filled: c[`${role}SlotsFilled` as const],
      }))
    : [];
  // Vai trò TNV có thể đăng ký: đúng chuyên môn + còn slot
  const eligibleRoles = slots.filter((s) => s.needed > 0 && s.filled < s.needed && myRoles.includes(s.role)).map((s) => s.role);

  async function join(role: AssignmentRole) {
    try {
      await apply.mutateAsync({ id, role });
      toast.success(`Đã gửi đăng ký vai trò ${ROLE_META[role]?.label ?? role}. Chờ quản trị viên duyệt.`);
      setPicking(false);
    } catch (e) {
      toast.error(errMsg(e, 'Đăng ký thất bại'));
    }
  }

  function onRegisterClick() {
    if (!user) {
      toast.info('Bạn cần có tài khoản tình nguyện viên để tham gia.');
      router.push('/register');
      return;
    }
    if (!isVolunteer) {
      toast.error('Chỉ tình nguyện viên mới tham gia được chiến dịch.');
      return;
    }
    if (myRoles.length === 0) {
      toast.error('Bạn chưa đăng ký chuyên môn nào — cập nhật hồ sơ tình nguyện viên để tham gia.');
      return;
    }
    if (eligibleRoles.length === 0) {
      toast.error('Không còn vai trò phù hợp chuyên môn của bạn để đăng ký.');
      return;
    }
    if (eligibleRoles.length === 1) {
      void join(eligibleRoles[0]);
      return;
    }
    setPicking((p) => !p);
  }

  function share() {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
      toast.success('Đã sao chép liên kết chiến dịch.');
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f7f1]">
      <PublicHeader />

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
        {isLoading && <div className="h-72 rounded-3xl bg-neutral-200 animate-pulse" />}

        {isError && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-neutral-200">
            <span className="material-symbols-outlined text-neutral-300 text-[56px]">event_busy</span>
            <p className="font-bold text-neutral-700 mt-3">Không tìm thấy chiến dịch</p>
            <p className="text-sm text-neutral-400 mt-1">Chiến dịch có thể đã đóng hoặc chưa được duyệt.</p>
            <button onClick={() => router.push('/')} className="mt-5 px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-bold">Về trang chủ</button>
          </div>
        )}

        {c && (
          <>
            {/* Hero */}
            <div className="relative rounded-3xl overflow-hidden h-64 md:h-72">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : CAMPAIGN_FALLBACK} alt={c.title} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
              <div className="relative h-full flex flex-col justify-center p-8 md:p-10 text-white max-w-2xl">
                <span className={`inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold mb-3 ${
                  isCompleted ? 'bg-amber-400/95 text-amber-950' : 'bg-emerald-500/90'
                }`}>
                  <span className="material-symbols-outlined text-[14px]">{isCompleted ? 'verified' : 'campaign'}</span>
                  {isCompleted ? 'Đã hoàn thành' : c.status === 'in_progress' ? 'Đang diễn ra' : 'Đang tuyển tình nguyện viên'}
                </span>
                <h1 className="font-extrabold text-3xl md:text-4xl leading-tight">{c.title}</h1>
                {c.description && <p className="text-sm text-white/85 mt-3 line-clamp-2 max-w-xl">{c.description}</p>}
              </div>
            </div>

            {/* Băng số liệu tác động — chỉ khi đã hoàn thành */}
            {isCompleted && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                <StatTile align="center" icon="restaurant" value={c.actualServings ?? c.distributionSummary.servingsServed} label="suất ăn đã trao" />
                <StatTile align="center" icon="diversity_3" value={c.distributionSummary.peopleServed} label="người được phục vụ" />
                <StatTile align="center" icon="volunteer_activism" value={c.participants.length} label="tình nguyện viên" />
                <StatTile
              align="center"
                  icon="sentiment_very_satisfied"
                  value={c.avgSatisfaction != null ? `${c.avgSatisfaction.toFixed(1)}/5` : '—'}
                  label={`hài lòng (${c.feedbackCount} phản hồi)`}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              {/* Cột trái */}
              <div className="lg:col-span-2 space-y-5">
                <Card title="Câu chuyện chiến dịch" icon="auto_stories">
                  {c.description
                    ? c.description.split('\n').filter(Boolean).map((p, i) => <p key={i} className="text-sm text-neutral-600 leading-relaxed mb-3 last:mb-0">{p}</p>)
                    : <p className="text-sm text-neutral-400">Chưa có mô tả cho chiến dịch này.</p>}
                </Card>

                {/* Thư viện ảnh hành trình — khi hoàn thành & có ảnh minh chứng */}
                {isCompleted && c.proofGallery.length > 0 && (
                  <Card title="Hành trình chiến dịch qua ảnh" icon="photo_library">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {c.proofGallery.map((p, i) => <ProofPhoto key={i} p={p} />)}
                    </div>
                  </Card>
                )}

                {c.menuItems.length > 0 && (
                  <Card title="Thực đơn trong ngày" icon="restaurant_menu">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {c.menuItems.map((m, i) => (
                        <div key={i} className="rounded-2xl bg-neutral-50 border border-neutral-150 p-4 text-center">
                          <span className="material-symbols-outlined text-emerald-600 text-[26px]">restaurant</span>
                          <p className="font-bold text-sm text-neutral-800 mt-1">{m.name}</p>
                          {m.type && <p className="text-[11px] text-neutral-400">{m.type}</p>}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Nhu cầu nhân lực — ẩn khi đã hoàn thành */}
                {!isCompleted && (
                  <Card title="Nhu cầu nhân lực" icon="groups">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      {slots.filter((s) => s.needed > 0).map((s) => {
                        const pct = Math.min(100, Math.round((s.filled / s.needed) * 100));
                        return (
                          <div key={s.role}>
                            <div className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1.5">
                              <span>{ROLE_META[s.role].label}</span>
                              <span className="text-neutral-400">{s.filled}/{s.needed}</span>
                            </div>
                            <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Các đợt phân phát + phản hồi người nhận — khi hoàn thành */}
                {isCompleted && c.distributions.length > 0 && (
                  <Card title="Các đợt trao suất ăn" icon="takeout_dining">
                    <div className="space-y-3">
                      {c.distributions.map((d) => <DistributionRow key={d.id} d={d} />)}
                    </div>
                  </Card>
                )}

                {c.scheduleItems.length > 0 && (
                  <Card title="Lịch trình hoạt động" icon="schedule">
                    <div className="space-y-2">
                      {c.scheduleItems.map((t, i) => (
                        <div key={i} className="flex gap-4 items-center rounded-xl px-4 py-3 bg-neutral-50">
                          <span className="text-xs font-bold text-neutral-500 w-24 shrink-0">{t.time}</span>
                          <span className="text-sm text-neutral-700">{t.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Tình nguyện viên đã tham gia — tên thật */}
                <Card title="Những người đã chung tay" icon="diversity_3">
                  {c.participants.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {c.participants.map((p) => <ParticipantChip key={p.id} p={p} />)}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-400">Chưa có tình nguyện viên nào — hãy là người đầu tiên!</p>
                  )}
                </Card>

                {/* Cảm nhận của tình nguyện viên */}
                {isCompleted && (
                  <Card title="Cảm nhận của tình nguyện viên" icon="format_quote">
                    {c.experiences.length > 0 ? (
                      <div className="space-y-4">
                        {c.experiences.map((e) => <ExperienceCard key={e.id} e={e} />)}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400">Chưa có cảm nhận nào được chia sẻ.</p>
                    )}
                    {isVolunteer && <ExperienceForm campaignId={id} />}
                  </Card>
                )}

                {c.supplyItems.length > 0 && (
                  <Card title="Vật phẩm cần thiết" icon="inventory_2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {c.supplyItems.map((s, i) => (
                        <div key={i} className="rounded-2xl border border-neutral-150 p-4 text-center bg-neutral-50">
                          <span className="material-symbols-outlined text-emerald-600 text-[24px]">inventory_2</span>
                          <p className="text-xs font-semibold text-neutral-700 mt-1">{s}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Nguyên liệu được quyên góp */}
                {c.donations.length > 0 && (
                  <Card title="Nguyên liệu được quyên góp" icon="local_shipping">
                    <div className="space-y-2">
                      {c.donations.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-sm rounded-xl bg-neutral-50 px-4 py-2.5">
                          <span className="material-symbols-outlined text-[16px] text-emerald-600">volunteer_activism</span>
                          <span className="font-semibold text-neutral-700">{d.quantity ? `${d.quantity} ` : ''}{d.itemName}</span>
                          <span className="text-neutral-400 text-xs">· {d.provider.businessName}</span>
                          <span className={`ml-auto text-[11px] font-bold ${d.status === 'received' ? 'text-emerald-600' : 'text-honey-600'}`}>
                            {d.status === 'received' ? 'Đã nhận' : 'Đã hứa góp'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>

              {/* Cột phải (sticky) */}
              <div className="space-y-5 lg:sticky lg:top-6 self-start">
                {/* Thông tin chi tiết */}
                <div className="bg-white border border-neutral-150 rounded-3xl p-6 space-y-4">
                  <h3 className="font-bold text-lg text-neutral-900">Thông tin chi tiết</h3>
                  <InfoRow icon="calendar_month" label="Ngày tổ chức" value={new Date(c.scheduledDate).toLocaleDateString('vi-VN')} />
                  <InfoRow icon="schedule" label="Thời gian" value={`${c.startTime} - ${c.endTime}`} />
                  <InfoRow icon="place" label="Địa điểm" value={c.kitchenAddress} />
                  {c.organizationName && <InfoRow icon="volunteer_activism" label="Tổ chức" value={c.organizationName} />}
                  {c.expectedServings != null && <InfoRow icon="restaurant" label="Dự kiến" value={`${c.expectedServings} suất`} />}
                </div>

                {/* CTA đăng ký — chỉ khi còn tuyển & chưa qua ngày diễn ra */}
                {canRegister && (
                  <>
                    <button
                      onClick={onRegisterClick}
                      disabled={apply.isPending}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition-colors disabled:opacity-50"
                    >
                      {apply.isPending ? 'Đang xử lý...' : 'Đăng ký tình nguyện'}
                    </button>
                    <p className="text-[11px] text-neutral-400 text-center -mt-2">Đăng ký sẽ được quản trị viên duyệt trước khi nhận.</p>

                    {picking && eligibleRoles.length > 1 && (
                      <div className="bg-white border border-neutral-150 rounded-2xl p-3 space-y-2">
                        <p className="text-xs font-bold text-neutral-500 px-1">Chọn vai trò tham gia:</p>
                        {eligibleRoles.map((role) => (
                          <button key={role} onClick={() => join(role)} disabled={apply.isPending}
                            className="w-full py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                            <span className="material-symbols-outlined text-[16px]">{ROLE_META[role].icon}</span> {ROLE_META[role].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {isCompleted && (
                  <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center">
                    <span className="material-symbols-outlined text-amber-500 text-[40px]">workspace_premium</span>
                    <p className="font-bold text-neutral-900 mt-1">Chiến dịch đã hoàn thành</p>
                    <p className="text-xs text-neutral-500 mt-1">Cảm ơn tất cả tình nguyện viên & nhà hảo tâm đã chung tay!</p>
                  </div>
                )}

                {!isCompleted && isPast && (
                  <div className="bg-neutral-50 border border-neutral-200 rounded-3xl p-6 text-center">
                    <span className="material-symbols-outlined text-neutral-400 text-[40px]">event_busy</span>
                    <p className="font-bold text-neutral-900 mt-1">Đã qua ngày diễn ra</p>
                    <p className="text-xs text-neutral-500 mt-1">Chiến dịch này không còn nhận đăng ký tình nguyện.</p>
                  </div>
                )}

                <button onClick={share} className="w-full py-3 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-2xl font-bold text-sm transition-colors inline-flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">share</span> Chia sẻ chiến dịch
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function ProofPhoto({ p }: { p: CampaignProofPhoto }) {
  return (
    <div className="relative rounded-2xl overflow-hidden aspect-square bg-neutral-100 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(p.url)} alt={PROOF_KIND[p.kind] ?? p.kind} className="w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
        <p className="text-[10px] font-bold text-white">{PROOF_KIND[p.kind] ?? p.kind}</p>
        <p className="text-[9px] text-white/70 truncate">{p.by}</p>
      </div>
    </div>
  );
}

function ParticipantChip({ p }: { p: CampaignParticipant }) {
  const rm = ROLE_META[p.role] ?? { label: p.role, icon: 'work' };
  return (
    <span className="inline-flex items-center gap-2 bg-neutral-50 border border-neutral-150 rounded-full pl-1.5 pr-3 py-1">
      {p.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(p.avatarUrl)} alt={p.fullName} className="w-7 h-7 rounded-full object-cover" />
      ) : (
        <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">
          {p.fullName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-700">{p.fullName}</span>
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
        <span className="material-symbols-outlined text-[12px]">{rm.icon}</span>{rm.label}
      </span>
    </span>
  );
}

function DistributionRow({ d }: { d: CampaignDistribution }) {
  return (
    <div className="rounded-2xl border border-neutral-150 overflow-hidden">
      <div className="flex gap-3 p-3">
        {d.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(d.photoUrl)} alt={d.roundLabel ?? 'Đợt phân phát'} className="w-20 h-20 rounded-xl object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-neutral-800">{d.roundLabel || 'Đợt phân phát'}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {d.servingsServed} suất · {d.peopleServed} người{d.leftoverServings > 0 ? ` · còn dư ${d.leftoverServings}` : ''}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Phụ trách: {d.servedBy}</p>
          {d.note && <p className="text-xs text-neutral-600 mt-1 italic">“{d.note}”</p>}
        </div>
      </div>
      {d.feedback.length > 0 && (
        <div className="bg-neutral-50 px-3 py-2 space-y-1.5 border-t border-neutral-100">
          {d.feedback.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                {Array.from({ length: 5 }).map((_, k) => (
                  <span key={k} className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: k < f.satisfaction ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                ))}
              </span>
              {f.comment && <span className="text-neutral-600">{f.comment}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceCard({ e }: { e: CampaignExperience }) {
  return (
    <div className="rounded-2xl border border-neutral-150 p-4">
      <div className="flex items-center gap-2.5">
        {e.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(e.avatarUrl)} alt={e.fullName} className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
            {e.fullName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-bold text-sm text-neutral-800">{e.fullName}</p>
          {e.rating != null && (
            <span className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: 5 }).map((_, k) => (
                <span key={k} className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: k < e.rating! ? "'FILL' 1" : "'FILL' 0" }}>star</span>
              ))}
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-600 leading-relaxed mt-2 whitespace-pre-line">{e.content}</p>
      {e.imageUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {e.imageUrls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={mediaUrl(u)} alt="Ảnh cảm nhận" className="w-full aspect-square rounded-xl object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceForm({ campaignId }: { campaignId: string }) {
  const add = useAddExperience();
  const upload = useUploadExperienceImage();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(5);
  const [images, setImages] = useState<string[]>([]);

  async function onPick(file: File) {
    try {
      const res = await upload.mutateAsync(file);
      setImages((prev) => [...prev, res.url].slice(0, 6));
    } catch (e) {
      toast.error(errMsg(e, 'Tải ảnh thất bại'));
    }
  }

  async function submit() {
    if (content.trim().length < 5) { toast.error('Cảm nhận tối thiểu 5 ký tự'); return; }
    try {
      await add.mutateAsync({ id: campaignId, content: content.trim(), rating, imageUrls: images });
      toast.success('Đã chia sẻ cảm nhận của bạn. Cảm ơn bạn!');
      setContent(''); setImages([]); setRating(5); setOpen(false);
    } catch (e) {
      toast.error(errMsg(e, 'Gửi cảm nhận thất bại'));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-4 w-full py-2.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors">
        <span className="material-symbols-outlined text-[18px]">edit</span> Chia sẻ cảm nhận của bạn
      </button>
    );
  }

  return (
    <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
      <p className="text-xs text-neutral-400">Chỉ tình nguyện viên đã tham gia chiến dịch mới chia sẻ được.</p>
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-neutral-500 mr-1">Đánh giá:</span>
        {Array.from({ length: 5 }).map((_, k) => (
          <button key={k} type="button" onClick={() => setRating(k + 1)}>
            <span className="material-symbols-outlined text-[22px] text-amber-500" style={{ fontVariationSettings: k < rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          </button>
        ))}
      </div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={2000}
        placeholder="Trải nghiệm của bạn khi tham gia chiến dịch này..." className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((u, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(u)} alt="Ảnh" className="w-full aspect-square rounded-lg object-cover" />
              <button onClick={() => setImages(images.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer py-2 border border-dashed border-neutral-300 rounded-xl text-xs font-bold text-neutral-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">{upload.isPending ? 'hourglass_top' : 'add_photo_alternate'}</span>
          {upload.isPending ? 'Đang tải...' : 'Thêm ảnh'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = ''; }} />
        </label>
        <button onClick={submit} disabled={add.isPending}
          className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-bold disabled:opacity-50">
          {add.isPending ? 'Đang gửi...' : 'Gửi'}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-2 text-neutral-400 text-sm">Huỷ</button>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-neutral-150 rounded-3xl p-6">
      <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-emerald-600 text-[20px]">{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="material-symbols-outlined text-[18px] text-emerald-600 mt-0.5">{icon}</span>
      <div>
        <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-neutral-800">{value}</p>
      </div>
    </div>
  );
}
