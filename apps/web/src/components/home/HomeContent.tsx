'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

// Deterministic number formatter (Vietnamese style using dots as thousand separator) to prevent SSR/CSR hydration mismatch.
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function HomeContent() {
  const router = useRouter();
  const [filterTab, setFilterTab] = useState<'near' | 'raw'>('near');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [donationAmount, setDonationAmount] = useState<number>(500000);
  const [impactTab, setImpactTab] = useState<'image' | 'calc'>('calc');
  const [partnersCount, setPartnersCount] = useState<number>(1200000);
  const [foodCount, setFoodCount] = useState<number>(2000);

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
      <section 
        className="w-full px-6 md:px-16 lg:px-24 pt-12 pb-32 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-fade-in-up relative overflow-hidden"
        style={{
          backgroundImage: 'linear-gradient(to bottom, #FAFBF9 0%, rgba(250, 251, 249, 0.15) 35%, rgba(250, 251, 249, 0) 70%, #FAFBF9 98%), url("/hero_food_bg.png")',
          backgroundPosition: 'bottom center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover'
        }}
      >
        {/* Hero Left Content */}
        <div className="lg:col-span-7 space-y-6 z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold text-[11px] uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            🛡️ HỆ THỐNG XÁC THỰC THỜI GIAN THỰC
          </div>

          <h1 className="font-extrabold text-4xl sm:text-5xl lg:text-6xl text-neutral-900 leading-tight">
            Giải cứu thực phẩm dư thừa. <br />
            <span className="text-emerald-700">Số hóa chuỗi điều phối cộng đồng.</span>
          </h1>

          <p className="text-neutral-500 font-medium text-base sm:text-lg leading-relaxed max-w-2xl">
            Sử dụng quy trình xác minh đa lớp để đảm bảo thực phẩm từ các đối tác được luân chuyển an toàn đến những nơi cần thiết nhất, giảm thiểu lãng phí và minh bạch hóa dòng tiền đóng góp.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <button
              onClick={() => router.push('/listings')}
              className="px-8 py-4 bg-emerald-800 hover:bg-emerald-950 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-850/10 hover:shadow-emerald-950/20 transition-all flex items-center gap-2 group active:scale-95"
            >
              Giải cứu ngay
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
            <button
              onClick={() => toast.info('Tính năng đang được tải dữ liệu thực tế...')}
              className="px-6 py-4 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">article</span>
              Xem thực tế vận hành
            </button>
          </div>
        </div>

        {/* Hero Right: High-Fidelity Mock Phone Display */}
        <div className="lg:col-span-5 flex justify-center z-10">
          <div className="relative w-[310px] h-[590px] bg-neutral-900 rounded-[48px] p-3.5 shadow-2xl border-4 border-neutral-950 ring-8 ring-neutral-900/5 flex flex-col overflow-hidden">
            {/* Phone notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-6 bg-neutral-900 rounded-b-2xl z-30" />
            
            {/* Phone screen content */}
            <div className="bg-white flex-1 rounded-[36px] overflow-hidden flex flex-col justify-between p-5 pt-8 relative z-20 border border-neutral-100">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-3.5 border-b border-neutral-100 mb-2">
                  <span className="material-symbols-outlined text-[18px] text-emerald-800 font-bold">arrow_back</span>
                  <span className="font-extrabold text-xs text-neutral-800">Xác nhận Đơn hàng</span>
                </div>

                {/* Success confirm block */}
                <div className="bg-emerald-800 text-white rounded-2xl p-5 text-center flex flex-col items-center gap-2.5 shadow-md shadow-emerald-800/10">
                  <div className="w-7 h-7 rounded-full bg-white text-emerald-800 flex items-center justify-center shadow-inner">
                    <span className="material-symbols-outlined text-[16px] font-black">check</span>
                  </div>
                  <h4 className="font-extrabold text-[12px] leading-tight px-1">Đã xác nhận thủ công bởi Cửa hàng</h4>
                </div>

                {/* Info row */}
                <div className="space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-100 text-left">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Thông tin Đơn hàng</p>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-2.5 text-neutral-700">
                      <span className="material-symbols-outlined text-[16px] text-neutral-400">restaurant</span>
                      <span className="font-semibold">Đơn hàng: Bánh mì</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-neutral-700">
                      <span className="material-symbols-outlined text-[16px] text-neutral-400">shopping_bag</span>
                      <span className="font-semibold">Số lượng: 20 túi</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-neutral-700">
                      <span className="material-symbols-outlined text-[16px] text-neutral-400">calendar_today</span>
                      <span className="font-semibold">Hạn sử dụng: Hôm nay</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom verify button */}
              <button className="w-full py-3 bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-800/10 hover:bg-emerald-950 transition-colors">
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. STATS COUNTER ROW */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-12 animate-fade-in-up [animation-delay:150ms]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1 */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Thiết lập đầu mối</span>
              <div className="flex items-end gap-0.5 h-6">
                <div className="w-1 bg-emerald-200 h-2 rounded-t" />
                <div className="w-1 bg-emerald-300 h-4 rounded-t" />
                <div className="w-1 bg-emerald-400 h-3 rounded-t" />
                <div className="w-1 bg-emerald-500 h-5 rounded-t" />
                <div className="w-1 bg-emerald-600 h-6 rounded-t" />
              </div>
            </div>
            <p className="text-sm text-neutral-600">Hơn 450 tập đoàn đối tác tham gia đóng góp.</p>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Thực phẩm đã giải cứu</span>
              <span className="material-symbols-outlined text-[18px] text-emerald-600">energy_savings_leaf</span>
            </div>
            <h3 className="text-3xl font-extrabold text-neutral-900 mt-2">{formatNumber(foodCount)} Tấn</h3>
            <p className="text-sm text-neutral-600">Mục tiêu năm 2026: 5,000 tấn thực phẩm cứu trợ.</p>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Sự ủng hộ tracker</span>
              <span className="material-symbols-outlined text-[18px] text-neutral-400">volunteer_activism</span>
            </div>
            <h3 className="text-lg font-bold text-neutral-950 mt-2">
              <span className="text-3xl font-black text-neutral-900">100k</span> VND = <span className="text-emerald-700 font-extrabold">5 Suất</span>
            </h3>
            <p className="text-sm text-neutral-600">Mỗi lượt quyên góp được sử dụng trực tiếp vận hành logistics.</p>
          </div>

        </div>
      </section>

      {/* 3. VỀ CHÚNG TÔI SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 animate-fade-in-up [animation-delay:250ms]">
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 sm:p-10 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4">
            <h2 className="font-extrabold text-4xl text-neutral-900 relative inline-block pb-2">
              Về chúng tôi
              <span className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-700 rounded-full" />
            </h2>
          </div>
          <div className="lg:col-span-8 space-y-6">
            <p className="text-neutral-700 font-medium text-lg leading-relaxed">
              FoodResQ là hệ sinh thái số hóa chuỗi cung ứng thực phẩm cộng đồng, kết nối trực tiếp Nhà cung cấp, Tình nguyện viên và Các bếp ăn từ thiện để tối ưu hóa nguồn lực xã hội và giảm thiểu lãng phí thực phẩm.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-neutral-100">
              <div className="flex items-center gap-3 text-sm font-semibold text-neutral-800">
                <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                </span>
                5 phút toàn diện
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold text-neutral-800">
                <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">groups</span>
                </span>
                Kết nối cộng đồng
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold text-neutral-800">
                <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">security</span>
                </span>
                Giảm thiểu lãng phí
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. HỆ SINH THÁI FOODRESQ SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center animate-fade-in-up [animation-delay:300ms]">
        
        {/* Left Side: 2x2 Image Grid */}
        <div className="lg:col-span-6 bg-emerald-50/50 p-4 rounded-3xl grid grid-cols-2 gap-4">
          <img src="/eco_volunteers.png" alt="Volunteers" className="w-full aspect-square object-cover rounded-2xl shadow-sm" />
          <img src="/eco_delivery.png" alt="Delivery 1" className="w-full aspect-square object-cover rounded-2xl shadow-sm" />
          <img src="/eco_delivery.png" alt="Delivery 2" className="w-full aspect-square object-cover rounded-2xl shadow-sm" />
          <img src="/eco_cooking.png" alt="Cooking" className="w-full aspect-square object-cover rounded-2xl shadow-sm" />
        </div>

        {/* Right Side: Description and 3 Pillars */}
        <div className="lg:col-span-6 space-y-6">
          <h2 className="font-extrabold text-4xl text-neutral-900">Hệ sinh thái FoodResQ</h2>
          <p className="text-neutral-600 font-medium text-base leading-relaxed">
            Chúng tôi xây dựng một vòng lặp tuần hoàn, nơi thực phẩm không bị lãng phí mà trở thành nguồn lực quý giá nuôi dưỡng cộng đồng. Quy trình khép kín kết nối ba trụ cột chính:
          </p>

          <div className="space-y-4">
            
            {/* Pillar 1 */}
            <div className="bg-white rounded-2xl border border-neutral-200/75 p-5 flex gap-4 items-start shadow-sm hover:border-emerald-500/20 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">storefront</span>
              </span>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-neutral-900">Nhà cung cấp (Donors)</h4>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Siêu thị, nhà hàng, khách sạn chia sẻ thực phẩm thặng dư chất lượng cao một cách minh bạch.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="bg-white rounded-2xl border border-neutral-200/75 p-5 flex gap-4 items-start shadow-sm hover:border-emerald-500/20 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">local_shipping</span>
              </span>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-neutral-900">Mạng lưới Logistics Xanh</h4>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Tình nguyện viên và đội ngũ vận chuyển được tối ưu hóa bằng công nghệ AI để giao hàng nhanh nhất.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="bg-white rounded-2xl border border-neutral-200/75 p-5 flex gap-4 items-start shadow-sm hover:border-emerald-500/20 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">volunteer_activism</span>
              </span>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-neutral-900">Người thụ hưởng (Beneficiaries)</h4>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Bếp ăn thiện nguyện, mái ấm và các cá nhân khó khăn nhận được hỗ trợ thực phẩm an toàn.
                </p>
              </div>
            </div>

          </div>
        </div>

      </section>

      {/* 4. SẢN THỰC PHẨM THẶNG DƯ SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 space-y-10 animate-fade-in-up [animation-delay:350ms]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-4xl text-neutral-900">Sản Thực Phẩm Thặng Dư</h2>
            <p className="text-base text-neutral-600 mt-2">Sở hữu những thực phẩm chất lượng cao từ các tiệm bánh và siêu thị hàng đầu.</p>
          </div>
          
          <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl w-fit self-start">
            <button
              onClick={() => setFilterTab('near')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filterTab === 'near' ? 'bg-white text-emerald-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Xuất bản gần
            </button>
            <button
              onClick={() => setFilterTab('raw')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filterTab === 'raw' ? 'bg-white text-emerald-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Nguyên liệu thô
            </button>
          </div>
        </div>

        {/* 4 Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          
          {/* Card 1: Bánh mì & Croissant */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm flex flex-col justify-between group hover:border-emerald-500/30 hover:shadow-md transition-all duration-350">
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img src="/food_bread.png" alt="Bánh mì & Croissant" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white text-[10px] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] text-rose-400">schedule</span>
                01:45:20
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Bánh ngọt & Tráng miệng</span>
                <span className="font-extrabold text-base text-emerald-800">45.000đ</span>
              </div>
              <h3 className="font-bold text-neutral-900 text-base group-hover:text-emerald-850 transition-colors">Bánh mì & Croissant</h3>
              <div className="flex items-center gap-4 text-xs text-neutral-600">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">place</span>
                  Quận 1, TP.HCM
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">inventory_2</span>
                  Còn lại 05 phần
                </span>
              </div>
              <button 
                onClick={() => router.push('/listings')}
                className="w-full py-3 bg-emerald-800 hover:bg-emerald-950 text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-emerald-850/5 active:scale-95"
              >
                Lấy ngay
              </button>
            </div>
          </div>

          {/* Card 2: Cơm trưa văn phòng */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm flex flex-col justify-between group hover:border-emerald-500/30 hover:shadow-md transition-all duration-350">
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img src="/food_lunchbox.png" alt="Cơm trưa văn phòng" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white text-[10px] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] text-rose-400">schedule</span>
                03:12:15
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Suất ăn sẵn</span>
                <span className="font-extrabold text-base text-emerald-800">35.000đ</span>
              </div>
              <h3 className="font-bold text-neutral-900 text-base group-hover:text-emerald-850 transition-colors">Cơm trưa văn phòng</h3>
              <div className="flex items-center gap-4 text-xs text-neutral-600">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">place</span>
                  Bình Thạnh, TP.HCM
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">inventory_2</span>
                  Còn lại 02 phần
                </span>
              </div>
              <button 
                onClick={() => router.push('/listings')}
                className="w-full py-3 bg-emerald-800 hover:bg-emerald-950 text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-emerald-850/5 active:scale-95"
              >
                Lấy ngay
              </button>
            </div>
          </div>

          {/* Card 3: Salad ngũ sắc */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm flex flex-col justify-between group hover:border-emerald-500/30 hover:shadow-md transition-all duration-350">
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img src="/food_salad.png" alt="Salad ngũ sắc" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-bold text-xs">
                Sắp mở bán (18:00)
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Healthy & Rau củ</span>
                <span className="font-extrabold text-base text-emerald-800">40.000đ</span>
              </div>
              <h3 className="font-bold text-neutral-900 text-base">Salad ngũ sắc</h3>
              <div className="flex items-center gap-4 text-xs text-neutral-600">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">place</span>
                  Quận 7, TP.HCM
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">inventory_2</span>
                  Dự kiến 10 phần
                </span>
              </div>
              <button 
                disabled 
                className="w-full py-3 bg-neutral-150 text-neutral-450 border border-neutral-200 rounded-xl text-sm font-bold cursor-not-allowed"
              >
                Chờ mở bán
              </button>
            </div>
          </div>

          {/* Card 4: Hết hàng */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm flex flex-col justify-between opacity-60">
            <div className="relative aspect-[4/3] bg-neutral-100 filter grayscale">
              <img src="/food_bread.png" alt="Bánh ngọt Pháp" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center text-white font-extrabold text-xs tracking-wider">
                HẾT HÀNG
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Bánh ngọt & Tráng miệng</span>
                <span className="font-extrabold text-base text-neutral-400">50.000đ</span>
              </div>
              <h3 className="font-bold text-neutral-400 text-base">Gói bánh ngọt Pháp</h3>
              <div className="flex items-center gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">place</span>
                  Quận 3, TP.HCM
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-neutral-400">inventory_2</span>
                  Còn lại 00 phần
                </span>
              </div>
              <button 
                disabled 
                className="w-full py-3 bg-neutral-150 text-neutral-400 border border-neutral-200 rounded-xl text-sm font-bold cursor-not-allowed"
              >
                Hết hàng
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 5. BẢN ĐỒ VẬN HÀNH / NHẬT KÝ TRỰC TUYẾN SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 animate-fade-in-up [animation-delay:450ms]">
        
        {/* Left Column: Operation Map Monitor */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <span className="px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold text-xs uppercase tracking-wider">
              TRẠNG THÁI VẬN HÀNH: 45 Shippers • 12 Hubs
            </span>
          </div>

          {/* Desktop Monitor Screen Wrapper */}
          <div className="bg-neutral-800 rounded-2xl p-2.5 border border-neutral-700/60 shadow-inner relative flex-1 min-h-[300px]">
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
        <div className="lg:col-span-5 bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm flex flex-col justify-between h-full">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-xl text-neutral-900 flex items-center gap-1.5">
                Nhật ký trực tuyến
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
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
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 space-y-10 animate-fade-in-up [animation-delay:550ms]">
        <div>
          <h2 className="font-extrabold text-4xl text-neutral-900">Quy trình điều phối 4 bước</h2>
          <p className="text-base text-neutral-600 mt-2">Quy trình khép kín đảm bảo an toàn thực phẩm và minh bạch xã hội.</p>
        </div>

        {/* 4 Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm space-y-4 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>assignment</span>
            </div>
            <h4 className="font-bold text-neutral-900 text-base">01. Tiếp nhận & Kiểm duyệt</h4>
            <p className="text-neutral-600 text-sm leading-relaxed">
              Nhà cung cấp đề nghị thực phẩm dư, hệ thống tự động phân loại, kiểm tra chất lượng trước khi đăng.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm space-y-4 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
            </div>
            <h4 className="font-bold text-neutral-900 text-base">02. Điều phối Shippers</h4>
            <p className="text-neutral-600 text-sm leading-relaxed">
              Hệ thống gom và tìm tình nguyện viên gần nhất trong bán kính 5km, tối ưu hóa thời gian giao nhận.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm space-y-4 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>fact_check</span>
            </div>
            <h4 className="font-bold text-neutral-900 text-base">03. Bàn giao & Lưu mẫu</h4>
            <p className="text-neutral-600 text-sm leading-relaxed">
              Trạm Hub/Bếp ăn từ thiện tiếp nhận thực phẩm và lưu mẫu kiểm tra an toàn thực phẩm, đồng thời dán tem QR Code.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm space-y-4 hover:-translate-y-1 transition-transform duration-300">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_scanner</span>
            </div>
            <h4 className="font-bold text-neutral-900 text-base">04. Xác thực & Cấp phát</h4>
            <p className="text-neutral-600 text-sm leading-relaxed">
              Người nhận quét mã Digital ID (CCCD) để xác minh và nhận thực phẩm hằng ngày.
            </p>
          </div>

        </div>

        {/* Emergency Bottom Bar */}
        <div className="bg-rose-50 rounded-2xl border border-rose-100 p-6 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-rose-900 text-sm font-bold text-center lg:text-left">
            <span className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </span>
            <div>
              <p className="font-extrabold text-rose-900 text-base">Giao thức khẩn cấp</p>
              <p className="text-xs text-rose-700/80 mt-1">Kích hoạt khi phát hiện sự cố chất lượng hoặc thực phẩm quá hạn.</p>
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
        <h3 className="text-sm font-bold text-neutral-550 uppercase tracking-wider text-center sm:text-left">Bảng xếp hạng đối tác xanh</h3>
        
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

      {/* 8. CÂU CHUYỆN TÁC ĐỘNG SECTION */}
      <section className="w-full px-6 md:px-16 lg:px-24 py-20 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center animate-fade-in-up [animation-delay:700ms]">
        
        {/* Left Side: Text and Testimonial */}
        <div className="lg:col-span-6 space-y-6">
          <h2 className="font-extrabold text-4xl text-neutral-900">Câu chuyện tác động</h2>
          <p className="text-neutral-600 font-medium text-base leading-relaxed">
            Đằng sau mỗi con số là một cuộc đời được sưởi ấm. FoodResQ không chỉ chuyển giao thực phẩm, chúng tôi chuyển giao hy vọng và sự sẻ chia từ cộng đồng đến những hoàn cảnh khó khăn nhất.
          </p>

          {/* Testimonial card */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm relative space-y-4">
            <span className="absolute top-4 right-6 text-emerald-100 font-serif text-6xl select-none pointer-events-none">“</span>
            <p className="text-sm text-neutral-750 leading-relaxed italic pr-6 relative z-10">
              "Nhờ có sự điều phối của FoodResQ, bếp ăn của chúng tôi luôn có đủ nguyên liệu tươi ngon mỗi ngày để phục vụ hàng trăm suất cơm cho người lao động nghèo. Sự minh bạch của hệ thống giúp chúng tôi yên tâm tuyệt đối."
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-300 shrink-0" />
              <div>
                <h5 className="font-bold text-neutral-900 text-sm">Bà Nguyễn Thị Mai</h5>
                <p className="text-xs text-neutral-550 font-semibold">Đại diện Bếp ăn Từ thiện Q.8</p>
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
              className="w-full aspect-[4/3] object-cover rounded-3xl shadow-sm border border-neutral-100"
            />
          ) : (
            <div className="bg-white rounded-3xl border border-neutral-200 p-6 space-y-6 shadow-sm">
              <div className="flex justify-between items-center">
                <h4 className="font-extrabold text-neutral-900 text-base flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">calculate</span>
                  Bảng tính tác động đồng hành
                </h4>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-850 text-xs font-bold">
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
        <div className="text-center space-y-2">
          <h2 className="font-extrabold text-4xl text-neutral-900">Tiêu chuẩn An toàn & Câu hỏi thường gặp</h2>
          <p className="text-base text-neutral-600 max-w-3xl mx-auto">
            Chúng tôi tuân thủ các quy chuẩn quốc tế nghiêm ngặt nhất để đảm bảo chất lượng thực phẩm cứu trợ.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Certifications */}
          <div className="lg:col-span-5 bg-neutral-100/75 border border-neutral-200 rounded-3xl p-8 space-y-6">
            <h4 className="font-extrabold text-neutral-900 text-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-850 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              Chứng chỉ & Tiêu chuẩn
            </h4>
            <ul className="space-y-4 text-sm font-semibold text-neutral-800">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </span>
                ISO 22000: Hệ thống quản lý ATTP
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </span>
                HACCP: Phân tích mối nguy & điểm kiểm soát
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </span>
                Quy chuẩn 4 bước lưu mẫu vật lý bắt buộc
              </li>
            </ul>
          </div>

          {/* Right Column: FAQ Accordion */}
          <div className="lg:col-span-7 space-y-4">
            
             {/* FAQ Item 1 */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === 0 ? null : 0)}
                className="w-full p-5 flex items-center justify-between text-left font-bold text-sm text-neutral-900 hover:bg-neutral-50 transition-colors"
              >
                <span>Thực phẩm thặng dư có an toàn không?</span>
                <span className={`material-symbols-outlined text-[18px] transition-transform ${activeFaq === 0 ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
              {activeFaq === 0 && (
                <div className="px-5 pb-5 text-sm text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3.5">
                  Tất cả thực phẩm được đăng tải đều phải qua quy trình kiểm duyệt Date và cảm quan từ nhà cung cấp, sau đó được Hub kiểm định lại trước khi gắn mã QR xác thực.
                </div>
              )}
            </div>

            {/* FAQ Item 2 */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === 1 ? null : 1)}
                className="w-full p-5 flex items-center justify-between text-left font-bold text-sm text-neutral-900 hover:bg-neutral-50 transition-colors"
              >
                <span>Làm thế nào để trở thành Tình nguyện viên?</span>
                <span className={`material-symbols-outlined text-[18px] transition-transform ${activeFaq === 1 ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
              {activeFaq === 1 && (
                <div className="px-5 pb-5 text-sm text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3.5">
                  Bạn chỉ cần đăng ký tài khoản TNV trên FoodResQ, hoàn thành khóa học an toàn thực phẩm online ngắn hạn là có thể bắt đầu nhận các đơn điều phối vận chuyển.
                </div>
              )}
            </div>

            {/* FAQ Item 3 */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === 2 ? null : 2)}
                className="w-full p-5 flex items-center justify-between text-left font-bold text-sm text-neutral-900 hover:bg-neutral-50 transition-colors"
              >
                <span>Làm sao để biết sự đóng góp của tôi đến đúng nơi?</span>
                <span className={`material-symbols-outlined text-[18px] transition-transform ${activeFaq === 2 ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
              {activeFaq === 2 && (
                <div className="px-5 pb-5 text-sm text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3.5">
                  Hệ thống ghi nhận hành trình thực phẩm từ lúc nhận đến lúc phát bằng QR code và cập nhật thời gian thực trên báo cáo minh bạch cho cộng đồng.
                </div>
              )}
            </div>

          </div>

        </div>
      </section>

      {/* 11. FOOTER */}
      <footer className="bg-white border-t border-neutral-200 pt-16 pb-8 text-neutral-550 animate-fade-in-up [animation-delay:950ms]">
        <div className="w-full px-6 md:px-16 lg:px-24 grid grid-cols-1 md:grid-cols-4 gap-12">
          
          <div className="space-y-4">
            <h4 className="font-extrabold text-xl text-neutral-900">FoodResQ</h4>
            <p className="text-sm leading-relaxed text-neutral-600">
              Hệ thống số hóa quy trình giải cứu thực phẩm dư thừa hàng đầu Việt Nam.
            </p>
            <div className="flex gap-3 text-neutral-400">
              <span className="material-symbols-outlined text-[18px] cursor-pointer hover:text-emerald-700">share</span>
              <span className="material-symbols-outlined text-[18px] cursor-pointer hover:text-emerald-700">chat</span>
              <span className="material-symbols-outlined text-[18px] cursor-pointer hover:text-emerald-700">alternate_email</span>
            </div>
          </div>

          <div className="space-y-3">
            <h5 className="font-bold text-sm text-neutral-900 uppercase tracking-wider">Tài nguyên</h5>
            <ul className="text-sm space-y-3 font-medium">
              <li><a href="#" className="hover:text-emerald-700 transition-colors">System Documentation</a></li>
              <li><a href="#" className="hover:text-emerald-700 transition-colors">User Manuals</a></li>
              <li><a href="#" className="hover:text-emerald-700 transition-colors">Legal Compliance</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h5 className="font-bold text-sm text-neutral-900 uppercase tracking-wider">Cộng đồng</h5>
            <ul className="text-sm space-y-3 font-medium">
              <li><a href="#" className="hover:text-emerald-700 transition-colors">Bảng xếp hạng Đối tác xanh</a></li>
              <li><a href="#" className="hover:text-emerald-700 transition-colors">Góc Tình nguyện</a></li>
              <li><a href="#" className="hover:text-emerald-700 transition-colors">Tuyển dụng TNV</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h5 className="font-bold text-sm text-neutral-900 uppercase tracking-wider">Liên hệ</h5>
            <p className="text-sm leading-relaxed text-neutral-600">
              Email: support@foodresq.vn<br />
              Hotline: 1900 1000<br />
              Hà Nội & TP. Hồ Chí Minh
            </p>
          </div>

        </div>

        <div className="w-full px-6 md:px-16 lg:px-24 mt-12 pt-6 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© 2026 FoodResQ. All rights reserved. Partnering for a sustainable future.</p>
          <div className="flex gap-4 font-semibold">
            <a href="#" className="hover:text-emerald-700">Quy định bảo mật</a>
            <a href="#" className="hover:text-emerald-700">Điều khoản sử dụng</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
