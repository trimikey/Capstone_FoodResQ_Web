'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useListings } from '@/hooks/useListings';
import { usePublicCampaigns } from '@/hooks/useCampaigns';
import { mediaUrl } from '@/lib/utils';

// Deterministic number formatter (Vietnamese style using dots as thousand separator) to prevent SSR/CSR hydration mismatch.
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const CAT_LABEL: Record<string, string> = {
  cooked_meal: 'Suất ăn sẵn',
  bakery: 'Bánh ngọt & Tráng miệng',
  fresh_fruit: 'Trái cây tươi',
  beverage: 'Đồ uống',
  vegetables: 'Rau củ quả',
  raw_protein: 'Thịt, cá, trứng',
  dry_goods: 'Đồ khô',
  canned_packaged: 'Đồ hộp / đóng gói',
  other: 'Khác',
};
const CAT_IMG: Record<string, string> = {
  bakery: '/food_bread.png',
  cooked_meal: '/food_lunchbox.png',
  fresh_fruit: '/food_salad.png',
  vegetables: '/food_salad.png',
};
// Các loại thuộc nhóm "nguyên liệu thô" (cho tab lọc ở trang chủ)
const RAW_CATEGORIES = ['vegetables', 'raw_protein', 'dry_goods', 'canned_packaged'];
function showcaseImg(category: string, imageUrls: string[]): string {
  return imageUrls?.[0] || CAT_IMG[category] || '/food_bread.png';
}
function hoursLeft(end: string): string {
  const diff = new Date(end).getTime() - Date.now();
  if (diff <= 0) return 'Sắp hết hạn';
  const h = Math.floor(diff / 3_600_000);
  if (h >= 24) return `Còn ${Math.floor(h / 24)} ngày`;
  return h >= 1 ? `Còn ${h} giờ` : 'Sắp hết hạn';
}

// Ảnh fallback khi chiến dịch chưa có ảnh riêng (ảnh người Việt)
const CAMPAIGN_FALLBACK_IMAGES = ['/vn-pho.jpg', '/vn-streetfood.jpg', '/vn-farmer.jpg'];

// Showcase tĩnh — chỉ dùng khi CHƯA có chiến dịch thật nào đang mở
const FALLBACK_CAMPAIGNS = [
  { title: 'Giải cứu Nông sản Miền Tây', date: '15/10/2024', image: '/vn-caibe.jpg', desc: 'Hỗ trợ bà con nông dân tiêu thụ sản phẩm sạch sau mùa thu hoạch cao điểm.' },
  { title: 'Bữa cơm yêu thương', date: 'Hằng tuần', image: '/vn-pho.jpg', desc: 'Nấu và trao những suất ăn nóng cho người lao động nghèo, sinh viên và người già neo đơn.' },
  { title: 'Bếp ăn 0 đồng', date: 'Mỗi thứ 7', image: '/vn-streetfood.jpg', desc: 'Chế biến các suất ăn dinh dưỡng từ nguồn thực phẩm cứu trợ mỗi cuối tuần.' },
];

export default function HomeContent() {
  const router = useRouter();
  const [filterTab, setFilterTab] = useState<'near' | 'raw'>('near');
  // Listing thật để trưng ở trang chủ (endpoint /listings công khai)
  const { data: showcaseAll } = useListings({ limit: 8 });
  const showcase = (showcaseAll ?? [])
    .filter((l) => (filterTab === 'raw' ? RAW_CATEGORIES.includes(l.category) : true))
    .slice(0, 4);

  // Chiến dịch thật đang mở (công khai); rỗng → dùng showcase tĩnh
  const { data: liveCampaigns } = usePublicCampaigns();
  const campaignCards =
    liveCampaigns && liveCampaigns.length > 0
      ? liveCampaigns.map((c, i) => ({
          id: c.id as string | undefined,
          title: c.title,
          date: new Date(c.scheduledDate).toLocaleDateString('vi-VN'),
          image: c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : CAMPAIGN_FALLBACK_IMAGES[i % CAMPAIGN_FALLBACK_IMAGES.length],
          desc: c.description || c.kitchenAddress || '',
        }))
      : FALLBACK_CAMPAIGNS.map((c) => ({ ...c, id: undefined as string | undefined }));
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [donationAmount, setDonationAmount] = useState<number>(500000);
  const [impactTab, setImpactTab] = useState<'image' | 'calc'>('calc');
  const [partnersCount, setPartnersCount] = useState<number>(1200000);
  const [foodCount, setFoodCount] = useState<number>(2000);
  const [heroBgIndex, setHeroBgIndex] = useState<number>(0);

  const HERO_IMAGES = [
    '/new_wide_hero_1.png',
    '/new_wide_hero_2.png',
    '/new_wide_hero_3.png'
  ];

  // Rotate hero background every 4 seconds
  useEffect(() => {
    const bgTimer = setInterval(() => {
      setHeroBgIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 4000);
    return () => clearInterval(bgTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated counters on mount
  useEffect(() => {
    let partnerStart = 1200000;
    const partnerTarget = 1245890;
    const partnerStep = Math.ceil((partnerTarget - partnerStart) / 40);

    let foodStart = 2000;
    const foodTarget = 3452;
    const foodStep = Math.ceil((foodTarget - foodStart) / 40);

    const timer = setInterval(() => {
      partnerStart += partnerStep;
      foodStart += foodStep;

      let isFinished = true;

      if (partnerStart >= partnerTarget) {
        setPartnersCount(partnerTarget);
      } else {
        setPartnersCount(partnerStart);
        isFinished = false;
      }

      if (foodStart >= foodTarget) {
        setFoodCount(foodTarget);
      } else {
        setFoodCount(foodStart);
        isFinished = false;
      }

      if (isFinished) {
        clearInterval(timer);
      }
    }, 40);

    return () => clearInterval(timer);
  }, []);

  const [liveLogs, setLiveLogs] = useState([
    { time: 'Vừa xong', text: 'TNV Nguyễn Văn A vừa lấy hàng tại đại lý X.', status: 'ĐANG VẬN CHUYỂN', color: 'text-amber-600 bg-amber-50' },
    { time: '5 phút trước', text: 'Bếp ăn Từ Thiện B đã nhận 20 suất cơm từ Hub Q.2.', status: 'HOÀN THÀNH', color: 'text-emerald-600 bg-emerald-50' },
    { time: '12 phút trước', text: 'Hub Trạm Xá Q. Bình Thạnh nhận thêm 500 suất.', status: 'ĐÃ LƯU KHO', color: 'text-blue-600 bg-blue-50' },
    { time: '25 phút trước', text: 'Cửa hàng C báo cáo dư thừa 12kg bánh mì ngọt.', status: 'ĐÃ ĐĂNG', color: 'text-purple-600 bg-purple-50' }
  ]);

  // Simulate real-time log additions
  useEffect(() => {
    const names = ['Nguyễn Văn B', 'Trần Thị C', 'Lê Hoàng D', 'Phạm Minh E'];
    const hubs = ['Hub Q.1', 'Hub Q.7', 'Hub Bình Thạnh', 'Hub Thủ Đức'];
    const actions = [
      'đã nhận đơn giao hàng mới.',
      'vừa bàn giao 15 suất súp cua.',
      'đang di chuyển tới điểm nhận.',
      'đã hoàn tất ký nhận lưu mẫu.'
    ];

    const interval = setInterval(() => {
      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomHub = hubs[Math.floor(Math.random() * hubs.length)];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      const newLog = {
        time: 'Vừa xong',
        text: `TNV ${randomName} tại ${randomHub} ${randomAction}`,
        status: 'CẬP NHẬT',
        color: 'text-emerald-600 bg-emerald-50'
      };

      setLiveLogs(prev => [
        newLog,
        ...prev.map(log => log.time === 'Vừa xong' ? { ...log, time: '1 phút trước' } : log)
      ].slice(0, 5));
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#FAFBF9] min-h-screen text-neutral-800 relative overflow-hidden">
      {/* 1. HERO SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 pt-32 pb-24 relative overflow-hidden">
        {/* Background Slider */}
        <div className="absolute inset-0 z-0">
          {HERO_IMAGES.map((img, idx) => (
            <div
              key={img}
              className={`absolute inset-0 bg-center bg-no-repeat bg-cover transition-all duration-[1500ms] ease-in-out ${
                idx === heroBgIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
              }`}
              style={{
                backgroundImage: `url("${img}")`,
                backgroundPosition: 'center 15%'
              }}
            />
          ))}
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#FAFBF9]/60 via-[#FAFBF9]/10 to-[#FAFBF9]/70" />
        </div>

        <div className="max-w-4xl space-y-8 relative z-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold text-xs uppercase tracking-wider shadow-sm">
            Tác động của FoodResQ
          </div>
          <h1 className="font-extrabold text-7xl sm:text-8xl lg:text-9xl tracking-tighter tabular-nums leading-none">
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-900 to-emerald-600 drop-shadow-sm">
              {formatNumber(foodCount)}
            </span>
            <span className="text-4xl sm:text-5xl lg:text-6xl text-emerald-800/60 font-bold tracking-normal align-baseline ml-3">
              Tấn
            </span>
          </h1>
          <div className="h-1 w-20 bg-emerald-500 rounded-full my-6 opacity-70" />
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-4xl text-neutral-800 leading-snug max-w-2xl">
            thực phẩm dư thừa đã được giải cứu và phân phối lại cho các cộng đồng yếu thế.
          </h2>
          <p className="font-medium text-lg text-neutral-600 leading-relaxed max-w-xl">
            FoodResQ sử dụng hệ thống xác minh đa lớp để luân chuyển thức ăn an toàn từ đối tác đến đúng người cần. Minh bạch, hiệu quả và được vận hành hoàn toàn bởi cộng đồng tình nguyện.
          </p>

          <div className="flex flex-wrap gap-4 pt-8">
            <button
              onClick={() => router.push('/listings')}
              className="px-8 py-4 bg-emerald-800 hover:bg-emerald-950 text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-emerald-800/20 flex items-center gap-2 group active:scale-95"
            >
              Tham gia giải cứu
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
            <button
              onClick={() => toast.info('Tính năng đang được tải dữ liệu thực tế...')}
              className="px-8 py-4 bg-white/80 backdrop-blur-sm border border-neutral-200 hover:bg-white text-neutral-800 rounded-full font-bold text-sm transition-all flex items-center gap-2 active:scale-95 shadow-sm"
            >
              Xem báo cáo minh bạch
            </button>
          </div>
        </div>

        {/* Pagination Dots */}
        <div className="absolute bottom-8 left-6 md:left-16 lg:left-24 flex gap-2 z-10">
          {HERO_IMAGES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setHeroBgIndex(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === heroBgIndex ? 'w-8 bg-emerald-600' : 'w-2 bg-emerald-600/30 hover:bg-emerald-600/50'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* 9. HỆ SINH THÁI FOODRESQ SECTION */}
      <section id="about" className="w-full px-6 md:px-16 lg:px-24 py-20 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center animate-fade-in-up [animation-delay:300ms]">
        
        {/* Left Side: 2x2 Image Grid */}
        <div className="lg:col-span-6 grid grid-cols-2 gap-3">
          <img src="/eco_volunteers.png" alt="Volunteers" className="w-full aspect-square object-cover rounded-xl shadow-sm" />
          <img src="/eco_delivery.png" alt="Delivery 1" className="w-full aspect-square object-cover rounded-xl shadow-sm" />
          <img src="/eco_delivery.png" alt="Delivery 2" className="w-full aspect-square object-cover rounded-xl shadow-sm" />
          <img src="/eco_cooking.png" alt="Cooking" className="w-full aspect-square object-cover rounded-xl shadow-sm" />
        </div>

        {/* Right Side: Description and 3 Pillars */}
        <div className="lg:col-span-6 space-y-8">
          <div className="space-y-4">
            <h2 className="font-medium text-4xl text-on-surface">Hệ sinh thái FoodResQ</h2>
            <div className="h-px w-16 bg-neutral-300" />
            <p className="text-on-surface/80 text-lg leading-relaxed max-w-lg">
              Chúng tôi xây dựng một vòng lặp tuần hoàn, nơi thực phẩm không bị lãng phí mà trở thành nguồn lực quý giá nuôi dưỡng cộng đồng. Quy trình khép kín kết nối ba trụ cột chính:
            </p>
          </div>

          <div className="space-y-4">
            
            {/* Pillar 1 */}
            <div className="bg-transparent border border-neutral-200 p-5 flex gap-5 items-start hover:bg-white hover:border-[#236c2a]/30 transition-all">
              <span className="text-[#236c2a] flex items-center justify-center shrink-0 pt-1">
                <span className="material-symbols-outlined text-[24px]">storefront</span>
              </span>
              <div className="space-y-1.5">
                <h4 className="font-medium text-lg text-on-surface">Nhà cung cấp (Donors)</h4>
                <p className="text-on-surface/70 text-[15px] leading-relaxed">
                  Siêu thị, nhà hàng, khách sạn chia sẻ thực phẩm thặng dư chất lượng cao một cách minh bạch.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="bg-transparent border border-neutral-200 p-5 flex gap-5 items-start hover:bg-white hover:border-[#236c2a]/30 transition-all">
              <span className="text-[#236c2a] flex items-center justify-center shrink-0 pt-1">
                <span className="material-symbols-outlined text-[24px]">local_shipping</span>
              </span>
              <div className="space-y-1.5">
                <h4 className="font-medium text-lg text-on-surface">Mạng lưới Logistics Xanh</h4>
                <p className="text-on-surface/70 text-[15px] leading-relaxed">
                  Tình nguyện viên và đội ngũ vận chuyển được tối ưu hóa bằng công nghệ AI để giao hàng nhanh nhất.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="bg-transparent border border-neutral-200 p-5 flex gap-5 items-start hover:bg-white hover:border-[#236c2a]/30 transition-all">
              <span className="text-[#236c2a] flex items-center justify-center shrink-0 pt-1">
                <span className="material-symbols-outlined text-[24px]">volunteer_activism</span>
              </span>
              <div className="space-y-1.5">
                <h4 className="font-medium text-lg text-on-surface">Người thụ hưởng (Beneficiaries)</h4>
                <p className="text-on-surface/70 text-[15px] leading-relaxed">
                  Bếp ăn thiện nguyện, mái ấm và các cá nhân khó khăn nhận được hỗ trợ thực phẩm an toàn.
                </p>
              </div>
            </div>

          </div>
        </div>

      </section>

      {/* 3.5 INTERACTIVE SHOWCASE SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 bg-[#fdf2f4] flex flex-col items-center justify-center overflow-hidden relative">
        <style>
          {`
            @keyframes sway {
              0% { transform: rotate(-3deg) translateY(0); }
              100% { transform: rotate(3deg) translateY(-15px); }
            }
            .animate-sway-1 { animation: sway 4s ease-in-out infinite alternate; }
            .animate-sway-2 { animation: sway 5s ease-in-out infinite alternate-reverse; }
          `}
        </style>

        {/* Center Logo with Rotating Text */}
        <div className="relative w-80 h-80 flex items-center justify-center mb-12">
          <img src="/Logo_FoodResQ.png" alt="Logo" className="w-24 h-24 object-contain z-10" />
          <svg className="absolute inset-0 w-full h-full animate-[spin_15s_linear_infinite]" viewBox="0 0 100 100">
            <path id="circleTextPath" d="M 50, 50 m -35, 0 a 35,35 0 1,1 70,0 a 35,35 0 1,1 -70,0" fill="none" />
            <text className="text-[8px] font-bold fill-[#236c2a] tracking-[0.25em] uppercase">
              <textPath href="#circleTextPath" startOffset="0%">
                • ĐẶT THỨC ĂN • TÌM KIẾM THỨC ĂN • ĐẶT THỨC ĂN • TÌM KIẾM THỨC ĂN
              </textPath>
            </text>
          </svg>
        </div>

        {/* Shaking Arched Images */}
        <div className="flex gap-8 md:gap-16 items-end justify-center w-full max-w-4xl mt-4">
          <div className="w-48 md:w-72 aspect-[1/1.3] rounded-t-[1000px] rounded-b-2xl overflow-hidden animate-sway-1 shadow-lg border-[6px] border-white relative z-10">
            <img src="/food_bread.png" alt="Thực phẩm dư thừa" className="w-full h-full object-cover" />
          </div>
          <div className="w-56 md:w-80 aspect-[1/1.4] rounded-t-[1000px] rounded-b-2xl overflow-hidden animate-sway-2 shadow-lg border-[6px] border-white -mb-8 relative z-20">
            <img src="/food_salad.png" alt="Thực phẩm dư thừa 2" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      {/* 4. SÀN THỰC PHẨM THẶNG DƯ SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 space-y-12 animate-fade-in-up [animation-delay:350ms]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 border-b border-neutral-200 pb-6">
          <div className="space-y-2">
            <h2 className="font-medium text-4xl text-on-surface">Sàn Thực Phẩm Thặng Dư</h2>
            <p className="text-lg text-on-surface/80">Sở hữu những thực phẩm chất lượng cao từ các tiệm bánh và siêu thị hàng đầu.</p>
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={() => setFilterTab('near')}
              className={`pb-2 text-[15px] font-medium transition-all border-b-2 ${
                filterTab === 'near' ? 'border-[#236c2a] text-[#236c2a]' : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Xuất bản gần
            </button>
            <button
              onClick={() => setFilterTab('raw')}
              className={`pb-2 text-[15px] font-medium transition-all border-b-2 ${
                filterTab === 'raw' ? 'border-[#236c2a] text-[#236c2a]' : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Nguyên liệu thô
            </button>
          </div>
        </div>

        {/* 4 Grid Cards — dữ liệu thật từ API */}
        {showcase.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-neutral-200 rounded-2xl">
            <span className="material-symbols-outlined text-neutral-300 text-[56px]">restaurant</span>
            <p className="text-neutral-500 mt-2">
              Hiện chưa có thực phẩm nào đang mở. Hãy quay lại sau nhé!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {showcase.map((item) => (
              <div
                key={item.id}
                className="bg-transparent rounded-xl border border-neutral-200 overflow-hidden flex flex-col justify-between group hover:border-[#236c2a]/40 hover:bg-white transition-all duration-350 hover:-translate-y-2 hover:shadow-xl hover:shadow-[#236c2a]/5"
              >
                <div className="relative aspect-[4/3] bg-neutral-100 border-b border-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showcaseImg(item.category, item.imageUrls)}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white text-[10px] font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-emerald-300">schedule</span>
                    {hoursLeft(item.pickupEndTime)}
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                      {CAT_LABEL[item.category] || 'Khác'}
                    </span>
                    <span className="font-medium text-base text-[#236c2a]">Miễn phí</span>
                  </div>
                  <h3 className="font-medium text-on-surface text-lg group-hover:text-[#236c2a] transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-neutral-600 ">
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="material-symbols-outlined text-[16px] text-neutral-400">place</span>
                      <span className="truncate max-w-[120px]">{item.provider.businessName}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="material-symbols-outlined text-[16px] text-neutral-400">inventory_2</span>
                      Còn {item.quantityRemaining} {item.quantityUnit}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push(`/listings/${item.id}`)}
                    className="w-full py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-lg text-[15px] font-medium transition-all active:scale-95"
                  >
                    Lấy ngay
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CHIẾN DỊCH SẮP DIỄN RA */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 bg-neutral-50 animate-fade-in-up [animation-delay:400ms]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div className="space-y-2">
            <h2 className="font-medium text-4xl text-on-surface">Chiến dịch sắp diễn ra</h2>
            <p className="text-lg text-on-surface/80">Chung tay cùng chúng tôi trong những dự án ý nghĩa.</p>
          </div>
          <Link href="/campaigns" className="shrink-0 inline-flex items-center gap-1 text-[15px] font-semibold text-[#236c2a] hover:gap-2 transition-all">
            Xem tất cả <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {campaignCards.map((c) => (
            <div
              key={c.title}
              className="bg-white rounded-2xl border border-neutral-200/70 overflow-hidden flex flex-col group hover:-translate-y-2 hover:shadow-xl hover:shadow-[#236c2a]/5 transition-all duration-350"
            >
              <div className="relative aspect-[16/10] bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600/90 backdrop-blur text-white text-[11px] font-bold">
                  <span className="material-symbols-outlined text-[13px]">campaign</span> Sắp diễn ra
                </span>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <p className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">calendar_month</span> {c.date}
                </p>
                <h3 className="font-bold text-xl text-[#236c2a] mt-2">{c.title}</h3>
                <p className="text-sm text-neutral-600 mt-2 leading-relaxed flex-1">{c.desc}</p>
                <button
                  onClick={() => router.push(c.id ? `/campaigns/${c.id}` : '/campaigns')}
                  className="mt-5 w-full py-3 border border-[#236c2a]/30 text-[#236c2a] hover:bg-[#236c2a] hover:text-white rounded-lg text-[15px] font-semibold transition-all active:scale-95"
                >
                  Xem chi tiết
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. BẢN ĐỒ VẬN HÀNH / NHẬT KÝ TRỰC TUYẾN SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 animate-fade-in-up [animation-delay:450ms]">
        
        {/* Left Column: Operation Map Monitor */}
        <div className="lg:col-span-7 bg-transparent rounded-xl border border-neutral-200 p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <span className="px-4 py-2 rounded border border-[#236c2a]/20 text-[#236c2a] font-medium text-[13px] uppercase tracking-wider bg-[#236c2a]/5">
              Trạng thái vận hành: 45 Shippers • 12 Hubs
            </span>
          </div>

          {/* Desktop Monitor Screen Wrapper */}
          <div className="bg-[#1b1c1c] rounded-lg p-2.5 shadow-inner relative flex-1 min-h-[300px]">
            <div className="absolute inset-0 bg-[#E8F5E9]/5">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="monitor-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#2a332a" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#monitor-grid)" />
                
                {/* River */}
                <path d="M-20,100 C150,120 280,60 500,80 C700,100 850,150 1000,130" fill="none" stroke="#334155" strokeWidth="24" opacity="0.3" />

                {/* Grid streets */}
                <line x1="50" y1="-50" x2="50" y2="600" stroke="#334155" strokeWidth="4" opacity="0.6" />
                <line x1="200" y1="-50" x2="200" y2="600" stroke="#334155" strokeWidth="4" opacity="0.6" />
                <line x1="450" y1="-50" x2="450" y2="600" stroke="#334155" strokeWidth="4" opacity="0.6" />
                <line x1="-50" y1="180" x2="1000" y2="180" stroke="#334155" strokeWidth="4" opacity="0.6" />
                <line x1="-50" y1="280" x2="1000" y2="280" stroke="#334155" strokeWidth="4" opacity="0.6" />

                {/* Green dots */}
                <circle cx="200" cy="180" r="6" fill="#10B981" />
                <circle cx="450" cy="280" r="6" fill="#10B981" />
                <circle cx="200" cy="280" r="10" fill="#10B981" opacity="0.4" />
                <circle cx="200" cy="280" r="5" fill="#10B981" />

                {/* Animated signal line */}
                <path d="M200,180 Q325,230 450,280" fill="none" stroke="#10B981" strokeWidth="3" strokeDasharray="6,4" />
              </svg>
            </div>
            
            {/* Overlay stats dashboard inside monitor */}
            <div className="absolute bottom-4 left-4 right-4 bg-neutral-900/90 backdrop-blur border border-white/5 p-4 rounded-xl flex items-center justify-between text-white text-[11px]">
              <div>
                <p className="text-neutral-450 font-bold">Lưu lượng điều phối</p>
                <p className="text-sm font-extrabold text-emerald-400 mt-0.5">85 đơn hàng/giờ</p>
              </div>
              <div className="text-right">
                <p className="text-neutral-450 font-bold">Thời gian giao TB</p>
                <p className="text-sm font-extrabold text-emerald-400 mt-0.5">18.5 phút</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Operation Log */}
        <div className="lg:col-span-5 bg-transparent rounded-xl border border-neutral-200 p-6 flex flex-col justify-between h-full">
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-4">
              <h3 className="font-medium text-xl text-on-surface flex items-center gap-2">
                Nhật ký trực tuyến
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              </h3>
              <span className="material-symbols-outlined text-neutral-400 text-[18px]">open_in_new</span>
            </div>

            {/* List log items */}
            <div className="divide-y divide-neutral-100 max-h-[340px] overflow-y-auto pr-1">
              {liveLogs.map((log, idx) => (
                <div key={idx} className="py-3.5 flex items-start justify-between gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="font-bold text-neutral-800 leading-normal">{log.text}</p>
                    <span className="text-xs text-neutral-400 font-bold">{log.time}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9.5px] font-black shrink-0 ${log.color}`}>
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button 
            onClick={() => router.push('/listings')}
            className="w-full mt-4 py-3 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            Chi tiết bản đồ vận hành
          </button>
        </div>

      </section>

      {/* 6. QUY TRÌNH ĐIỀU PHỐI 4 BƯỚC SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 space-y-12 animate-fade-in-up [animation-delay:550ms]">
        <div className="border-b border-neutral-200 pb-6">
          <h2 className="font-medium text-4xl text-on-surface">Quy trình điều phối 4 bước</h2>
          <p className="text-lg text-on-surface/80 mt-2">Quy trình khép kín đảm bảo an toàn thực phẩm và minh bạch xã hội.</p>
        </div>

        {/* 4 Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          
          <div className="bg-transparent rounded-xl border border-neutral-200 p-6 space-y-4 hover:border-[#236c2a]/30 transition-all duration-300 hover:bg-white group">
            <div className="w-10 h-10 rounded-lg bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">assignment</span>
            </div>
            <h4 className="font-medium text-on-surface text-lg group-hover:text-[#236c2a] transition-colors">01. Tiếp nhận & Kiểm duyệt</h4>
            <p className="text-on-surface/70 text-[15px] leading-relaxed">
              Nhà cung cấp đề nghị thực phẩm dư, hệ thống tự động phân loại, kiểm tra chất lượng trước khi đăng.
            </p>
          </div>

          <div className="bg-transparent rounded-xl border border-neutral-200 p-6 space-y-4 hover:border-[#236c2a]/30 transition-all duration-300 hover:bg-white group">
            <div className="w-10 h-10 rounded-lg bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">local_shipping</span>
            </div>
            <h4 className="font-medium text-on-surface text-lg group-hover:text-[#236c2a] transition-colors">02. Điều phối Shippers</h4>
            <p className="text-on-surface/70 text-[15px] leading-relaxed">
              Hệ thống gom và tìm tình nguyện viên gần nhất trong bán kính 5km, tối ưu hóa thời gian giao nhận.
            </p>
          </div>

          <div className="bg-transparent rounded-xl border border-neutral-200 p-6 space-y-4 hover:border-[#236c2a]/30 transition-all duration-300 hover:bg-white group">
            <div className="w-10 h-10 rounded-lg bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">fact_check</span>
            </div>
            <h4 className="font-medium text-on-surface text-lg group-hover:text-[#236c2a] transition-colors">03. Bàn giao & Lưu mẫu</h4>
            <p className="text-on-surface/70 text-[15px] leading-relaxed">
              Trạm Hub/Bếp ăn từ thiện tiếp nhận thực phẩm và lưu mẫu kiểm tra ATTP, đồng thời dán tem QR Code.
            </p>
          </div>

          <div className="bg-transparent rounded-xl border border-neutral-200 p-6 space-y-4 hover:border-[#236c2a]/30 transition-all duration-300 hover:bg-white group">
            <div className="w-10 h-10 rounded-lg bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">qr_code_scanner</span>
            </div>
            <h4 className="font-medium text-on-surface text-lg group-hover:text-[#236c2a] transition-colors">04. Xác thực & Cấp phát</h4>
            <p className="text-on-surface/70 text-[15px] leading-relaxed">
              Người nhận quét mã Digital ID (CCCD) để xác minh và nhận thực phẩm hằng ngày.
            </p>
          </div>

        </div>

        {/* Emergency Bottom Bar */}
        <div className="bg-[#faf9f8] border border-rose-200 p-6 rounded-xl flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-rose-900 font-medium text-center lg:text-left">
            <span className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </span>
            <div>
              <p className="font-medium text-rose-900 text-lg">Giao thức khẩn cấp</p>
              <p className="text-sm text-rose-700/80 mt-0.5">Kích hoạt khi phát hiện sự cố chất lượng hoặc thực phẩm quá hạn.</p>
            </div>
          </div>
          <div className="flex gap-3 w-full lg:w-auto">
            <button 
              onClick={() => toast.error('Đã kích hoạt chế độ khẩn cấp! Đội ngũ điều phối đang xử lý.')}
              className="flex-1 lg:flex-none px-6 py-3 bg-rose-800 hover:bg-rose-900 text-white rounded-xl text-sm font-bold transition-colors"
            >
              Kích hoạt Tải điều phối khẩn cấp
            </button>
            <button 
              onClick={() => toast.info('Đơn hàng nghi ngờ đã được ngắt kết nối tạm thời.')}
              className="flex-1 lg:flex-none px-6 py-3 bg-white border border-rose-200 text-rose-800 hover:bg-rose-50 rounded-xl text-sm font-bold transition-colors"
            >
              Ngắt đơn hàng
            </button>
          </div>
        </div>
      </section>

      {/* 7. BẢNG XẾP HẠNG ĐỐI TÁC XANH SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-12 space-y-8 overflow-hidden animate-fade-in-up [animation-delay:650ms]">
        <h3 className="text-base font-medium text-on-surface uppercase tracking-widest text-center sm:text-left">Bảng xếp hạng đối tác xanh</h3>
        
        <div className="relative w-full overflow-hidden py-2">
          {/* Infinite Marquee Container */}
          <div className="animate-marquee flex gap-6">
            
            {/* Set 1 */}
            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">1</span>
                <span className="text-xs font-bold text-neutral-850">Green Bakery</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">2.5 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">2</span>
                <span className="text-xs font-bold text-neutral-850">Siêu thị Metro X</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">1.9 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">3</span>
                <span className="text-xs font-bold text-neutral-850">Daily Cafe Group</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">1.2 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">4</span>
                <span className="text-xs font-bold text-neutral-850">Bakery Haven</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">0.8 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">5</span>
                <span className="text-xs font-bold text-neutral-850">Bếp ăn Nghĩa Tình</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">0.6 Tấn cứu trợ</span>
            </div>

            {/* Set 2 (Duplicate for infinite seamless wrap) */}
            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">1</span>
                <span className="text-xs font-bold text-neutral-850">Green Bakery</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">2.5 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">2</span>
                <span className="text-xs font-bold text-neutral-850">Siêu thị Metro X</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">1.9 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">3</span>
                <span className="text-xs font-bold text-neutral-850">Daily Cafe Group</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">1.2 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">4</span>
                <span className="text-xs font-bold text-neutral-850">Bakery Haven</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">0.8 Tấn cứu trợ</span>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 px-6 py-4 flex items-center justify-between shadow-sm min-w-[280px]">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-xs flex items-center justify-center">5</span>
                <span className="text-xs font-bold text-neutral-850">Bếp ăn Nghĩa Tình</span>
              </div>
              <span className="text-[10px] font-black text-emerald-850 uppercase bg-emerald-50 px-2.5 py-1 rounded">0.6 Tấn cứu trợ</span>
            </div>

          </div>
        </div>
      </section>


      {/* 7.5 LIÊN HỆ / CTA SECTION */}
      <section id="contact" className="w-full px-6 md:px-16 lg:px-24 py-24 animate-fade-in-up [animation-delay:675ms]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
          
          {/* Left Column: Info */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-4">
              <span className="px-3 py-1.5 rounded-full bg-[#efe8d8] text-[#236c2a] text-xs font-bold uppercase tracking-widest">
                Liên hệ với chúng tôi
              </span>
              <h2 className="font-medium text-4xl text-on-surface">Liên hệ hỗ trợ</h2>
              <p className="text-on-surface/80 text-[15px] leading-relaxed max-w-md">
                Có bất kỳ câu hỏi nào về quy trình giải cứu thực phẩm, ứng dụng hoặc chỉ đơn giản là muốn nói lời chào? Chúng tôi luôn sẵn sàng lắng nghe.
              </p>
            </div>

            <div className="space-y-6 pt-4">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#efe8d8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#236c2a] text-[20px]">location_on</span>
                </div>
                <div>
                  <h5 className="font-medium text-on-surface text-[15px]">Địa chỉ</h5>
                  <p className="text-on-surface/70 text-sm mt-1">Đại học FPT, Khu Công nghệ cao Quận 9, TP.HCM</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#efe8d8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#236c2a] text-[20px]">call</span>
                </div>
                <div>
                  <h5 className="font-medium text-on-surface text-[15px]">Điện thoại</h5>
                  <p className="text-[#236c2a] text-sm mt-1 font-medium">(028) 7300 5588</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#efe8d8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#236c2a] text-[20px]">mail</span>
                </div>
                <div>
                  <h5 className="font-medium text-on-surface text-[15px]">Email</h5>
                  <p className="text-[#236c2a] text-sm mt-1 font-medium">support@foodresq.vn</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#efe8d8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#236c2a] text-[20px]">schedule</span>
                </div>
                <div>
                  <h5 className="font-medium text-on-surface text-[15px]">Giờ làm việc</h5>
                  <p className="text-on-surface/70 text-sm mt-1">
                    Thứ 2 - Thứ 6: 8:00 AM - 6:00 PM<br/>
                    Thứ 7 - CN: 9:00 AM - 12:00 PM
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7">
            <div className="bg-[#efe8d8] rounded-2xl p-8 md:p-10">
              <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); toast.success('Đã gửi thông tin liên hệ!'); }}>
                <div className="space-y-2">
                  <label className="font-medium text-on-surface text-[13px]">Họ và tên</label>
                  <input 
                    type="text" 
                    placeholder="Nhập tên của bạn" 
                    className="w-full px-4 py-3.5 bg-white border border-transparent rounded-xl text-sm outline-none focus:border-[#236c2a]/50 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-medium text-on-surface text-[13px]">Email</label>
                  <input 
                    type="email" 
                    placeholder="your@email.com" 
                    className="w-full px-4 py-3.5 bg-white border border-transparent rounded-xl text-sm outline-none focus:border-[#236c2a]/50 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-medium text-on-surface text-[13px]">Chủ đề</label>
                  <select defaultValue="" className="w-full px-4 py-3.5 bg-white border border-transparent rounded-xl text-sm outline-none focus:border-[#236c2a]/50 transition-colors text-on-surface/80">
                    <option value="" disabled>Chọn chủ đề...</option>
                    <option value="partner">Đăng ký làm đối tác F&B</option>
                    <option value="volunteer">Đăng ký làm tình nguyện viên</option>
                    <option value="support">Hỗ trợ kỹ thuật</option>
                    <option value="other">Khác</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="font-medium text-on-surface text-[13px]">Lời nhắn</label>
                  <textarea 
                    placeholder="Nhập lời nhắn của bạn..." 
                    rows={4}
                    className="w-full px-4 py-3.5 bg-white border border-transparent rounded-xl text-sm outline-none focus:border-[#236c2a]/50 transition-colors resize-none"
                  ></textarea>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl font-medium text-[15px] transition-colors"
                >
                  Gửi thông tin
                </button>
              </form>
            </div>
          </div>
          
        </div>
      </section>

      {/* 8. CÂU CHUYỆN TÁC ĐỘNG SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center animate-fade-in-up [animation-delay:700ms]">
        
        {/* Left Side: Text and Testimonial */}
        <div className="lg:col-span-6 space-y-8">
          <div className="space-y-4">
            <h2 className="font-medium text-4xl text-on-surface">Câu chuyện tác động</h2>
            <div className="h-px w-16 bg-neutral-300" />
            <p className="text-on-surface/80 text-lg leading-relaxed max-w-lg">
              Đằng sau mỗi con số là một cuộc đời được sưởi ấm. FoodResQ không chỉ chuyển giao thực phẩm, chúng tôi chuyển giao hy vọng và sự sẻ chia từ cộng đồng đến những hoàn cảnh khó khăn nhất.
            </p>
          </div>

          {/* Testimonial card */}
          <div className="bg-[#faf9f8] rounded-xl border border-neutral-200 p-8 relative space-y-6">
            <span className="absolute top-4 right-6 text-[#236c2a]/10 font-serif text-8xl select-none pointer-events-none leading-none">“</span>
            <p className="text-on-surface/90 text-base leading-relaxed italic pr-6 relative z-10">
              "Nhờ có sự điều phối của FoodResQ, bếp ăn của chúng tôi luôn có đủ nguyên liệu tươi ngon mỗi ngày để phục vụ hàng trăm suất cơm cho người lao động nghèo. Sự minh bạch của hệ thống giúp chúng tôi yên tâm tuyệt đối."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#236c2a]/20 shrink-0" />
              <div>
                <h5 className="font-medium text-on-surface text-[15px]">Bà Nguyễn Thị Mai</h5>
                <p className="text-on-surface/60 text-xs">Đại diện Bếp ăn Từ thiện Q.8</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => toast.info('Đang mở trang báo cáo chi tiết...')}
            className="px-6 py-3.5 border border-emerald-800 hover:bg-emerald-50 text-emerald-800 rounded-xl font-bold text-sm transition-colors"
          >
            Xem tất cả báo cáo tác động
          </button>
        </div>

        {/* Right Side: Interactive Switcher (Kitchen Image vs. Impact Calculator) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl w-fit">
            <button
              onClick={() => setImpactTab('calc')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                impactTab === 'calc' ? 'bg-white text-emerald-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              🌱 Ước tính tác động
            </button>
            <button
              onClick={() => setImpactTab('image')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                impactTab === 'image' ? 'bg-white text-emerald-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              📷 Không gian bếp ăn
            </button>
          </div>

          {impactTab === 'image' ? (
            <img 
              src="/impact_kitchen.png" 
              alt="Impact Kitchen" 
              className="w-full aspect-[4/3] object-cover rounded-xl border border-neutral-200"
            />
          ) : (
            <div className="bg-transparent rounded-xl border border-neutral-200 p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-neutral-200 pb-4">
                <h4 className="font-medium text-on-surface text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#236c2a] text-[20px]">calculate</span>
                  Bảng tính tác động đồng hành
                </h4>
                <span className="px-2.5 py-0.5 rounded border border-[#236c2a]/20 bg-[#236c2a]/5 text-[#236c2a] text-xs font-bold uppercase tracking-wider">
                  Live
                </span>
              </div>

              <p className="text-sm text-neutral-600 leading-relaxed">
                Kéo thanh trượt để tùy chỉnh mức đóng góp và theo dõi hiệu ứng tức thì đối với cuộc sống người nhận và môi trường xung quanh.
              </p>

              {/* Slider controls */}
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Số tiền ủng hộ:</span>
                  <span className="text-xl font-black text-emerald-800">{formatNumber(donationAmount)} đ</span>
                </div>
                <input 
                  type="range" 
                  min="50000" 
                  max="2000000" 
                  step="50000" 
                  value={donationAmount} 
                  onChange={(e) => setDonationAmount(Number(e.target.value))} 
                  className="w-full h-2 bg-emerald-100 rounded-lg appearance-none cursor-pointer accent-emerald-850"
                />
                <div className="flex justify-between text-xs font-semibold text-neutral-450">
                  <span>50k đ</span>
                  <span>1.0M đ</span>
                  <span>2.0M đ</span>
                </div>
              </div>

              {/* Calculated grid results */}
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-neutral-100">
                <div className="bg-emerald-50/40 border border-emerald-50 rounded-2xl p-3 text-center space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-850 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[16px]">restaurant</span>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-neutral-900">{(donationAmount / 20000).toFixed(0)}</p>
                    <p className="text-xs font-semibold text-neutral-600">Suất cơm nóng</p>
                  </div>
                </div>

                <div className="bg-sky-50/40 border border-sky-50 rounded-2xl p-3 text-center space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-850 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[16px]">co2</span>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-neutral-900">{(donationAmount / 20000 * 1.5).toFixed(1)} kg</p>
                    <p className="text-xs font-semibold text-neutral-600">CO2 giảm thiểu</p>
                  </div>
                </div>

                <div className="bg-rose-50/40 border border-rose-50 rounded-2xl p-3 text-center space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-850 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[16px]">local_gas_station</span>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-neutral-900">{(donationAmount * 0.15 / 1000).toFixed(1)} L</p>
                    <p className="text-xs font-semibold text-neutral-600">Xăng hỗ trợ TNV</p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

      </section>

      {/* 10. TIÊU CHUẨN AN TOÀN & FAQ SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 space-y-12 animate-fade-in-up [animation-delay:900ms]">
        <div className="text-center space-y-4">
          <h2 className="font-medium text-4xl text-on-surface">Tiêu chuẩn An toàn & Câu hỏi thường gặp</h2>
          <p className="text-lg text-on-surface/80 max-w-3xl mx-auto">
            Chúng tôi tuân thủ các quy chuẩn quốc tế nghiêm ngặt nhất để đảm bảo chất lượng thực phẩm cứu trợ.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Certifications */}
          <div className="lg:col-span-5 bg-transparent border border-neutral-200 rounded-xl p-8 space-y-6">
            <h4 className="font-medium text-on-surface text-xl flex items-center gap-2 border-b border-neutral-200 pb-4">
              <span className="material-symbols-outlined text-[#236c2a] text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              Chứng chỉ & Tiêu chuẩn
            </h4>
            <ul className="space-y-4 text-[15px] text-on-surface/90">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </span>
                ISO 22000: Hệ thống quản lý ATTP
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </span>
                HACCP: Phân tích mối nguy & điểm kiểm soát
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded bg-[#236c2a]/10 text-[#236c2a] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </span>
                Quy chuẩn 4 bước lưu mẫu vật lý bắt buộc
              </li>
            </ul>
          </div>

          {/* Right Column: FAQ Accordion */}
          <div className="lg:col-span-7 space-y-4">
            
             {/* FAQ Item 1 */}
            <div className="bg-transparent rounded-xl border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === 0 ? null : 0)}
                className="w-full p-5 flex items-center justify-between text-left font-medium text-on-surface hover:bg-white transition-colors"
              >
                <span>Thực phẩm thặng dư có an toàn không?</span>
                <span className={`material-symbols-outlined text-[20px] transition-transform ${activeFaq === 0 ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
              {activeFaq === 0 && (
                <div className="px-5 pb-5 text-[15px] text-on-surface/70 leading-relaxed border-t border-neutral-100 pt-3.5 bg-white/50">
                  Tất cả thực phẩm được đăng tải đều phải qua quy trình kiểm duyệt Date và cảm quan từ nhà cung cấp, sau đó được Hub kiểm định lại trước khi gắn mã QR xác thực.
                </div>
              )}
            </div>

            {/* FAQ Item 2 */}
            <div className="bg-transparent rounded-xl border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === 1 ? null : 1)}
                className="w-full p-5 flex items-center justify-between text-left font-medium text-on-surface hover:bg-white transition-colors"
              >
                <span>Làm thế nào để trở thành Tình nguyện viên?</span>
                <span className={`material-symbols-outlined text-[20px] transition-transform ${activeFaq === 1 ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
              {activeFaq === 1 && (
                <div className="px-5 pb-5 text-[15px] text-on-surface/70 leading-relaxed border-t border-neutral-100 pt-3.5 bg-white/50">
                  Bạn chỉ cần đăng ký tài khoản TNV trên FoodResQ, hoàn thành khóa học an toàn thực phẩm online ngắn hạn là có thể bắt đầu nhận các đơn điều phối vận chuyển.
                </div>
              )}
            </div>

            {/* FAQ Item 3 */}
            <div className="bg-transparent rounded-xl border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === 2 ? null : 2)}
                className="w-full p-5 flex items-center justify-between text-left font-medium text-on-surface hover:bg-white transition-colors"
              >
                <span>Làm sao để biết sự đóng góp của tôi đến đúng nơi?</span>
                <span className={`material-symbols-outlined text-[20px] transition-transform ${activeFaq === 2 ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
              {activeFaq === 2 && (
                <div className="px-5 pb-5 text-[15px] text-on-surface/70 leading-relaxed border-t border-neutral-100 pt-3.5 bg-white/50">
                  Hệ thống ghi nhận hành trình thực phẩm từ lúc nhận đến lúc phát bằng QR code và cập nhật thời gian thực trên báo cáo minh bạch cho cộng đồng.
                </div>
              )}
            </div>

          </div>

        </div>
      </section>

      {/* 11. FOOTER */}
      <footer className="bg-[#1a4f1f] border-t border-[#1a4f1f] pt-16 pb-8 text-white/80 animate-fade-in-up [animation-delay:950ms]">
        <div className="w-full px-6 md:px-16 lg:px-24 grid grid-cols-1 md:grid-cols-4 gap-12">
          
          <div className="space-y-4">
            <h4 className="font-medium text-2xl text-white">FoodResQ</h4>
            <p className="text-[15px] leading-relaxed text-white/70">
              Hệ thống số hóa quy trình giải cứu thực phẩm dư thừa hàng đầu Việt Nam.
            </p>
            <div className="flex gap-4 text-white/50">
              <span className="material-symbols-outlined text-[20px] cursor-pointer hover:text-white transition-colors">share</span>
              <span className="material-symbols-outlined text-[20px] cursor-pointer hover:text-white transition-colors">chat</span>
              <span className="material-symbols-outlined text-[20px] cursor-pointer hover:text-white transition-colors">alternate_email</span>
            </div>
          </div>

          <div className="space-y-4">
            <h5 className="font-medium text-base text-white uppercase tracking-widest">Tài nguyên</h5>
            <ul className="text-[15px] space-y-3">
              <li><a href="#" className="hover:text-white transition-colors">System Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">User Manuals</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Legal Compliance</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="font-medium text-base text-white uppercase tracking-widest">Cộng đồng</h5>
            <ul className="text-[15px] space-y-3">
              <li><a href="#" className="hover:text-white transition-colors">Bảng xếp hạng Đối tác xanh</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Góc Tình nguyện</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Tuyển dụng TNV</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="font-medium text-base text-white uppercase tracking-widest">Liên hệ</h5>
            <p className="text-[15px] leading-relaxed text-white/70">
              Email: support@foodresq.vn<br />
              Hotline: 1900 1000<br />
              Hà Nội & TP. Hồ Chí Minh
            </p>
          </div>

        </div>

        <div className="w-full px-6 md:px-16 lg:px-24 mt-16 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/50">
          <p>© 2026 FoodResQ. All rights reserved. Partnering for a sustainable future.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Quy định bảo mật</a>
            <a href="#" className="hover:text-white transition-colors">Điều khoản sử dụng</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
