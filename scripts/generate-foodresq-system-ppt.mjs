import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pptxgenModule = await import(
  process.env.PPTXGENJS_ENTRY
    ? pathToFileURL(process.env.PPTXGENJS_ENTRY).href
    : "pptxgenjs"
);
const pptxgen = pptxgenModule.default;

const root = process.cwd();
const outDir = path.join(root, "outputs");
fs.mkdirSync(outDir, { recursive: true });

const pub = (...parts) => path.join(root, "apps", "web", "public", ...parts);
const outFile = path.join(outDir, "FoodResQ_System_Overview_Defense.pptx");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "FoodResQ Team";
pptx.company = "FPT University";
pptx.subject = "FoodResQ system overview for capstone defense";
pptx.title = "FoodResQ - System Overview";
pptx.lang = "vi-VN";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "vi-VN",
};
pptx.defineLayout({ name: "FOODRESQ", width: 13.333, height: 7.5 });
pptx.layout = "FOODRESQ";

const C = {
  ink: "17312B",
  muted: "5D6A66",
  pale: "F4F8F5",
  pale2: "EDF5EF",
  green: "1F8A4C",
  green2: "72B16A",
  orange: "F28C38",
  blue: "2574A9",
  red: "D94D3F",
  yellow: "F6C85F",
  white: "FFFFFF",
  line: "D7E3DA",
  slate: "263B35",
};

const W = 13.333;
const H = 7.5;
const M = 0.55;

function addLogo(slide, small = true) {
  const logo = pub("Logo_FoodResQ.png");
  if (fs.existsSync(logo)) {
    slide.addImage({ path: logo, x: small ? 11.65 : 0.72, y: small ? 0.34 : 0.44, w: small ? 1.05 : 1.35, h: small ? 0.46 : 0.58 });
  }
}

function addFooter(slide, idx) {
  slide.addShape(pptx.ShapeType.line, { x: M, y: 7.05, w: 12.22, h: 0, line: { color: C.line, width: 1 } });
  slide.addText("FoodResQ | Capstone SP26SE088", { x: M, y: 7.13, w: 4.8, h: 0.18, fontFace: "Aptos", fontSize: 7.6, color: C.muted, margin: 0 });
  slide.addText(String(idx).padStart(2, "0"), { x: 12.24, y: 7.1, w: 0.5, h: 0.22, fontSize: 8, color: C.muted, bold: true, align: "right", margin: 0 });
  addLogo(slide);
}

function title(slide, t, sub = "") {
  slide.addText(t, { x: M, y: 0.52, w: 8.5, h: 0.55, fontSize: 25, bold: true, color: C.ink, margin: 0 });
  if (sub) slide.addText(sub, { x: M, y: 1.08, w: 8.8, h: 0.32, fontSize: 10.5, color: C.muted, margin: 0 });
}

function pill(slide, text, x, y, w, fill = C.pale2, color = C.ink) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.34, rectRadius: 0.05, fill: { color: fill }, line: { color: fill, transparency: 100 } });
  slide.addText(text, { x: x + 0.1, y: y + 0.075, w: w - 0.2, h: 0.14, fontSize: 7.7, bold: true, color, align: "center", margin: 0 });
}

function card(slide, x, y, w, h, heading, body, accent = C.green) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line, width: 1 } });
  slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h, fill: { color: accent }, line: { color: accent, transparency: 100 } });
  slide.addText(heading, { x: x + 0.23, y: y + 0.18, w: w - 0.38, h: 0.25, fontSize: 11.5, bold: true, color: C.ink, margin: 0 });
  slide.addText(body, { x: x + 0.23, y: y + 0.52, w: w - 0.38, h: h - 0.7, fontSize: 8.7, color: C.muted, breakLine: false, fit: "shrink", margin: 0.02, valign: "mid" });
}

function flowNode(slide, text, x, y, w, h, fill = C.white, color = C.ink) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.05, fill: { color: fill }, line: { color: C.line, width: 1 } });
  slide.addText(text, { x: x + 0.08, y: y + 0.12, w: w - 0.16, h: h - 0.22, fontSize: 8.4, bold: true, color, align: "center", fit: "shrink", valign: "mid", margin: 0 });
}

function arrow(slide, x, y, w, h, color = C.green) {
  slide.addShape(pptx.ShapeType.rightArrow, { x, y, w, h, fill: { color }, line: { color, transparency: 100 } });
}

function imageFrame(slide, imagePath, x, y, w, h, caption) {
  if (fs.existsSync(imagePath)) {
    slide.addImage({ path: imagePath, x, y, w, h });
  } else {
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: "F7FAF8" }, line: { color: C.line, width: 1 } });
  }
  slide.addShape(pptx.ShapeType.rect, { x, y: y + h - 0.36, w, h: 0.36, fill: { color: C.ink, transparency: 8 }, line: { color: C.ink, transparency: 100 } });
  slide.addText(caption, { x: x + 0.14, y: y + h - 0.26, w: w - 0.28, h: 0.14, fontSize: 7.2, bold: true, color: C.white, margin: 0 });
}

function screenshotSlot(slide, label, x, y, w, h) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.05, fill: { color: "F9FBFA" }, line: { color: C.line, width: 1, dash: "dash" } });
  slide.addText("Ảnh cần chụp", { x: x + 0.18, y: y + 0.16, w: w - 0.36, h: 0.2, fontSize: 7.2, bold: true, color: C.green, margin: 0 });
  slide.addText(label, { x: x + 0.18, y: y + 0.45, w: w - 0.36, h: h - 0.6, fontSize: 8.2, bold: true, color: C.ink, fit: "shrink", valign: "mid", margin: 0 });
}

function addSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.pale };
  return s;
}

// 1
{
  const s = addSlide();
  const bg = pub("hero_food_bg.png");
  if (fs.existsSync(bg)) s.addImage({ path: bg, x: 0, y: 0, w: W, h: H });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: "0C1E18", transparency: 18 }, line: { transparency: 100 } });
  addLogo(s, false);
  s.addText("FoodResQ", { x: 0.72, y: 1.72, w: 5.4, h: 0.76, fontSize: 38, bold: true, color: C.white, margin: 0 });
  s.addText("Nền tảng cứu trợ và phân phối thực phẩm dư thừa", { x: 0.74, y: 2.55, w: 6.15, h: 0.5, fontSize: 18, bold: true, color: "EAF5EA", margin: 0 });
  s.addText("Kết nối nhà cung cấp, người nhận, tình nguyện viên và tổ chức từ thiện qua hệ thống đặt suất, QR, giao hàng, chiến dịch bếp và báo cáo tác động.", { x: 0.76, y: 3.24, w: 5.95, h: 0.88, fontSize: 12.2, color: C.white, fit: "shrink", margin: 0 });
  pill(s, "Capstone SP26SE088", 0.76, 4.42, 1.9, "FFFFFF", C.ink);
  pill(s, "FPT University", 2.88, 4.42, 1.62, "FFFFFF", C.ink);
  pill(s, "System Overview", 4.68, 4.42, 1.8, "FFFFFF", C.ink);
}

// 2
{
  const s = addSlide(); title(s, "Vấn đề & mục tiêu", "Từ thực phẩm dư thừa đến bữa ăn được phân phối đúng người, đúng thời điểm."); addFooter(s, 2);
  card(s, 0.7, 1.7, 3.75, 3.8, "Vấn đề xã hội", "- Nhà hàng, tiệm bánh, siêu thị có đồ ăn dư cuối ngày.\n- Người khó khăn và tổ chức từ thiện thiếu kênh nhận kịp thời.\n- Điều phối thủ công dễ trễ hạn, thiếu minh bạch.", C.red);
  card(s, 4.78, 1.7, 3.75, 3.8, "Mục tiêu hệ thống", "- Đăng đồ ăn nhanh theo vị trí và thời gian nhận.\n- Đặt giữ suất công bằng, tránh lạm dụng.\n- Hỗ trợ giao hàng, bếp từ thiện và đo lường tác động ESG.", C.green);
  imageFrame(s, pub("eco_beneficiary.png"), 8.88, 1.65, 3.6, 3.95, "Tác động: giảm lãng phí, tăng bữa ăn hỗ trợ");
}

// 3
{
  const s = addSlide(); title(s, "FoodResQ là gì?", "Một nền tảng client-server tập trung: mọi nghiệp vụ đi qua NestJS API, không client nào truy cập DB trực tiếp."); addFooter(s, 3);
  flowNode(s, "Provider\nđăng thực phẩm", 0.7, 2.1, 1.65, 0.85, "EAF6ED");
  arrow(s, 2.5, 2.33, 0.55, 0.32);
  flowNode(s, "Receiver\nđặt suất", 3.18, 2.1, 1.65, 0.85, "FFF4E8");
  arrow(s, 4.98, 2.33, 0.55, 0.32);
  flowNode(s, "QR / Face\nxác minh", 5.66, 2.1, 1.65, 0.85, "E9F2FA");
  arrow(s, 7.46, 2.33, 0.55, 0.32);
  flowNode(s, "Volunteer\ngiao hàng", 8.14, 2.1, 1.65, 0.85, "EEF6FF");
  arrow(s, 9.94, 2.33, 0.55, 0.32);
  flowNode(s, "Admin\nquản trị", 10.62, 2.1, 1.65, 0.85, "F8EFEF");
  card(s, 0.78, 4.05, 2.72, 1.45, "Điểm khác biệt", "Kết hợp cứu trợ thực phẩm lẻ, giao hàng tình nguyện, chiến dịch bếp nấu và báo cáo ESG trong một hệ thống.", C.green);
  card(s, 3.85, 4.05, 2.72, 1.45, "Minh bạch", "QR token, ảnh bằng chứng, lịch sử trạng thái, audit log, report và rating.", C.blue);
  card(s, 6.92, 4.05, 2.72, 1.45, "Công bằng", "Giới hạn đặt/ngày, trust score, lock Redis khi đặt suất và ưu tiên theo vị trí.", C.orange);
  card(s, 9.98, 4.05, 2.3, 1.45, "Mở rộng", "PostGIS, queue, WebSocket, FCM và cấu hình động.", C.green2);
}

// 4
{
  const s = addSlide(); title(s, "Các vai trò chính", "Mỗi vai trò có profile riêng, quyền riêng và hành trình sử dụng riêng."); addFooter(s, 4);
  imageFrame(s, pub("food_lunchbox.png"), 0.72, 1.55, 2.4, 1.72, "Provider");
  card(s, 0.72, 3.48, 2.4, 1.8, "Nhà cung cấp", "Tạo listing, quản lý tồn, xác nhận pickup, xem ESG.", C.green);
  imageFrame(s, pub("eco_beneficiary.png"), 3.43, 1.55, 2.4, 1.72, "Receiver");
  card(s, 3.43, 3.48, 2.4, 1.8, "Người nhận", "Tìm đồ gần mình, đặt suất, nhận QR, đánh giá/báo cáo.", C.orange);
  imageFrame(s, pub("shipper_TC.png"), 6.14, 1.55, 2.4, 1.72, "Volunteer");
  card(s, 6.14, 3.48, 2.4, 1.8, "Tình nguyện viên", "Giao đơn, tham gia bếp, nhận điểm cống hiến.", C.blue);
  imageFrame(s, pub("impact_kitchen.png"), 8.85, 1.55, 2.4, 1.72, "Charity");
  card(s, 8.85, 3.48, 2.4, 1.8, "Tổ chức từ thiện", "Tạo chiến dịch bếp, quản lý ca, phân phối suất ăn.", C.green2);
  card(s, 11.55, 1.55, 1.08, 3.73, "Admin", "Duyệt hồ sơ\nXử lý report\nQuản lý user\nTheo dõi hệ thống", C.red);
}

// 5
{
  const s = addSlide(); title(s, "Bức tranh module", "Các module bám theo nghiệp vụ, được tách trong NestJS và tái sử dụng qua web/mobile."); addFooter(s, 5);
  const mods = [
    ["Auth & Users", "JWT, refresh token, Firebase login, profile theo vai trò", C.green],
    ["Listings", "Đăng thực phẩm, danh mục, giờ nhận, vị trí PostGIS", C.orange],
    ["Reservations", "Đặt suất, QR, proof, rating, no-show/expiry", C.blue],
    ["Deliveries", "Offer shipper, tracking, trạng thái giao hàng, bulk run", C.green2],
    ["Campaigns", "Bếp từ thiện, ca làm, menu, donations, distribution", C.green],
    ["Trust & Reports", "Điểm uy tín, tố cáo, audit, xử lý vi phạm", C.red],
    ["Notifications", "Socket.IO realtime, FCM push, device tokens", C.blue],
    ["ESG & Admin", "Thống kê kg rescued, CO2 saved, dashboard quản trị", C.orange],
  ];
  mods.forEach(([h, b, c], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    card(s, 0.72 + col * 3.05, 1.65 + row * 2.25, 2.65, 1.62, h, b, c);
  });
}

// 6
{
  const s = addSlide(); title(s, "Luồng đặt suất & nhận bằng QR", "Luồng cốt lõi xử lý cạnh tranh số lượng và xác minh khi nhận."); addFooter(s, 6);
  const y = 2.0;
  flowNode(s, "1. Tìm listing\nST_DWithin", 0.7, y, 1.55, 0.8, "EAF6ED");
  arrow(s, 2.38, y + 0.23, 0.45, 0.28);
  flowNode(s, "2. Reserve\nchọn số lượng", 2.95, y, 1.55, 0.8, "FFF4E8");
  arrow(s, 4.63, y + 0.23, 0.45, 0.28);
  flowNode(s, "3. Redis lock\n10 giây", 5.2, y, 1.55, 0.8, "F8EFEF");
  arrow(s, 6.88, y + 0.23, 0.45, 0.28);
  flowNode(s, "4. Transaction\ntrừ tồn + tạo đơn", 7.45, y, 1.7, 0.8, "EEF6FF");
  arrow(s, 9.28, y + 0.23, 0.45, 0.28);
  flowNode(s, "5. QR 30 phút\npickup token", 9.85, y, 1.55, 0.8, "EAF6ED");
  arrow(s, 11.53, y + 0.23, 0.45, 0.28);
  flowNode(s, "6. Scan / Proof\ncomplete", 12.08, y, 0.9, 0.8, "FFFFFF");
  card(s, 0.95, 4.05, 3.2, 1.3, "Điểm cần nhấn mạnh", "Lock + transaction giúp tránh 2 người cùng đặt phần cuối cùng. QR token ngẫu nhiên và có hạn dùng.", C.green);
  screenshotSlot(s, "Màn hình receiver đặt suất và màn hình QR sau khi đặt thành công", 4.55, 3.72, 3.6, 1.75);
  screenshotSlot(s, "Màn hình provider scan QR / xác nhận pickup", 8.55, 3.72, 3.6, 1.75);
}

// 7
{
  const s = addSlide(); title(s, "Luồng Provider", "Provider là nguồn tạo cung thực phẩm và là người xác nhận giao/nhận tại điểm pickup."); addFooter(s, 7);
  flowNode(s, "Tạo listing\nảnh, số lượng, hạn dùng", 0.9, 1.85, 2.0, 0.85, "EAF6ED");
  arrow(s, 3.08, 2.1, 0.55, 0.32);
  flowNode(s, "Publish\nstatus active", 3.82, 1.85, 1.65, 0.85, "FFF4E8");
  arrow(s, 5.65, 2.1, 0.55, 0.32);
  flowNode(s, "Theo dõi reservation\nremaining quantity", 6.38, 1.85, 2.05, 0.85, "EEF6FF");
  arrow(s, 8.62, 2.1, 0.55, 0.32);
  flowNode(s, "Scan QR\npicked up", 9.35, 1.85, 1.55, 0.85, "EAF6ED");
  arrow(s, 11.07, 2.1, 0.55, 0.32);
  flowNode(s, "ESG report\nkg & CO2", 11.78, 1.85, 1.15, 0.85, "FFFFFF");
  screenshotSlot(s, "Provider dashboard: thống kê listing, đơn đặt, trạng thái nhận", 0.9, 3.55, 3.45, 1.7);
  screenshotSlot(s, "Form tạo listing: ảnh món ăn, số lượng, pickup window", 4.95, 3.55, 3.45, 1.7);
  screenshotSlot(s, "Provider ESG: food rescued kg, CO2 saved, trend chart", 9.0, 3.55, 3.45, 1.7);
}

// 8
{
  const s = addSlide(); title(s, "Luồng giao hàng tình nguyện", "Hệ thống chọn shipper gần nhất, xử lý cạnh tranh offer và cập nhật realtime."); addFooter(s, 8);
  card(s, 0.75, 1.6, 3.0, 1.45, "1. Tạo delivery", "Khi receiver chọn giao tận nơi, reservation tạo delivery pending_assignment.", C.blue);
  card(s, 3.98, 1.6, 3.0, 1.45, "2. Broadcast offer", "Tìm 5 shipper gần nhất bằng PostGIS, mỗi offer hết hạn sau 2 phút.", C.green);
  card(s, 7.2, 1.6, 3.0, 1.45, "3. First accept wins", "Shipper đầu tiên accept sẽ được gán; các offer còn lại expired.", C.orange);
  card(s, 10.42, 1.6, 2.15, 1.45, "4. Tracking", "Cập nhật vị trí và trạng thái qua WebSocket.", C.green2);
  imageFrame(s, pub("giaohang_TC.png"), 0.88, 3.55, 2.3, 1.6, "Giao hàng");
  screenshotSlot(s, "Volunteer offers: danh sách đơn gần mình", 3.7, 3.43, 2.45, 1.85);
  screenshotSlot(s, "Delivery detail: pickup, route, status update", 6.55, 3.43, 2.45, 1.85);
  screenshotSlot(s, "Receiver tracking map + trạng thái shipper", 9.4, 3.43, 2.45, 1.85);
}

// 9
{
  const s = addSlide(); title(s, "Luồng chiến dịch bếp từ thiện", "Mở rộng từ chia sẻ đồ ăn lẻ sang vận hành bếp, ca làm và phân phối suất ăn."); addFooter(s, 9);
  flowNode(s, "Charity tạo\ncampaign", 0.75, 1.68, 1.45, 0.78, "EAF6ED");
  arrow(s, 2.37, 1.9, 0.42, 0.26);
  flowNode(s, "Mở slot\nchef/waiter/shipper", 2.95, 1.68, 1.85, 0.78, "EEF6FF");
  arrow(s, 4.97, 1.9, 0.42, 0.26);
  flowNode(s, "Provider donation\nnguyên liệu", 5.55, 1.68, 1.75, 0.78, "FFF4E8");
  arrow(s, 7.47, 1.9, 0.42, 0.26);
  flowNode(s, "Kitchen ops\nmenu, safety log", 8.05, 1.68, 1.75, 0.78, "EAF6ED");
  arrow(s, 9.96, 1.9, 0.42, 0.26);
  flowNode(s, "Distribution\nmeal handoff", 10.55, 1.68, 1.65, 0.78, "FFFFFF");
  imageFrame(s, pub("nauan_TC.png"), 0.85, 3.15, 2.4, 1.7, "Bếp chiến dịch");
  screenshotSlot(s, "Charity campaign manage: registrations, schedule, status", 3.65, 3.05, 2.62, 1.9);
  screenshotSlot(s, "Kitchen dashboard: chef task, menu item, safety check", 6.65, 3.05, 2.62, 1.9);
  screenshotSlot(s, "Volunteer distribution: điểm phát, số suất, ảnh minh chứng", 9.65, 3.05, 2.62, 1.9);
}

// 10
{
  const s = addSlide(); title(s, "Trust score, an toàn & quản trị", "Cơ chế chống lạm dụng, xử lý vi phạm và bảo vệ chất lượng thực phẩm."); addFooter(s, 10);
  card(s, 0.78, 1.55, 2.75, 1.55, "Trust score", "Bắt đầu 100. No-show -20, hủy trễ -10, vi phạm ATTP -50. ≤60 bị hạn chế, ≤30 bị ban.", C.red);
  card(s, 3.85, 1.55, 2.75, 1.55, "Xác minh", "JWT, refresh token rotation, Firebase login, QR token, face compare khi pickup.", C.green);
  card(s, 6.92, 1.55, 2.75, 1.55, "Báo cáo", "Receiver/provider/volunteer có thể report user, listing, delivery, campaign.", C.orange);
  card(s, 9.98, 1.55, 2.3, 1.55, "Admin", "Duyệt hồ sơ, xử lý report, suspend/ban, audit log.", C.blue);
  screenshotSlot(s, "Admin dashboard: users, reports, verification requests", 0.95, 3.85, 3.2, 1.65);
  screenshotSlot(s, "Report issue modal hoặc rating sau pickup", 4.55, 3.85, 3.2, 1.65);
  screenshotSlot(s, "Face enrollment / pickup proof screen", 8.15, 3.85, 3.2, 1.65);
}

// 11
{
  const s = addSlide(); title(s, "Kiến trúc hệ thống", "Layered client-server architecture: business rule nằm ở API, dữ liệu tập trung ở PostgreSQL/PostGIS."); addFooter(s, 11);
  flowNode(s, "Next.js Web\nAdmin + Provider", 0.85, 1.65, 1.85, 0.72, "EAF6ED");
  flowNode(s, "Expo Mobile\nReceiver + Volunteer", 0.85, 2.65, 1.85, 0.72, "EEF6FF");
  arrow(s, 3.0, 2.08, 0.62, 0.34);
  flowNode(s, "NestJS API\nREST /api/v1", 3.85, 1.72, 1.85, 0.78, "FFFFFF");
  flowNode(s, "Socket.IO\nRealtime", 3.85, 2.72, 1.85, 0.62, "FFFFFF");
  arrow(s, 6.0, 2.08, 0.62, 0.34);
  flowNode(s, "Services\nBusiness rules", 6.85, 1.72, 1.85, 0.78, "EAF6ED");
  flowNode(s, "PrismaService\nData access", 6.85, 2.72, 1.85, 0.62, "EAF6ED");
  arrow(s, 9.0, 2.08, 0.62, 0.34);
  flowNode(s, "PostgreSQL\n+ PostGIS", 9.85, 1.45, 1.65, 0.74, "FFF4E8");
  flowNode(s, "Redis\nLock + Queue", 9.85, 2.35, 1.65, 0.74, "F8EFEF");
  flowNode(s, "Firebase / FCM\nPush + login", 9.85, 3.25, 1.65, 0.74, "EEF6FF");
  card(s, 0.95, 4.72, 3.1, 1.12, "Điểm bảo vệ", "Client chỉ gọi API/Socket; mọi phân quyền, validation, transaction, raw spatial query được kiểm soát ở backend.", C.green);
  card(s, 4.45, 4.72, 3.1, 1.12, "Tính mở rộng", "Redis lock/queue tách xử lý đồng thời, WebSocket/FCM tách realtime notification.", C.blue);
  card(s, 7.95, 4.72, 3.1, 1.12, "Dữ liệu vị trí", "PostGIS geography + GiST index cho tìm đồ ăn/shipper gần nhất theo mét.", C.orange);
}

// 12
{
  const s = addSlide(); title(s, "Công nghệ sử dụng", "Stack TypeScript xuyên suốt, kèm các dịch vụ cho realtime, queue, geospatial và xác thực."); addFooter(s, 12);
  const tech = [
    ["Frontend Web", "Next.js App Router, React, Tailwind, shadcn/ui, TanStack Query, Axios, Zod, Zustand"],
    ["Mobile", "Expo / React Native, React Query, AsyncStorage, Map/Location, camera/QR flows"],
    ["Backend", "NestJS, Prisma, Passport JWT, class-validator, Swagger, Pino, Helmet, Throttler"],
    ["Database", "PostgreSQL, PostGIS geography(Point,4326), Prisma schema, migrations"],
    ["Async/Realtime", "Redis, Redlock, BullMQ, Socket.IO, Firebase Cloud Messaging"],
    ["Media & AI-like services", "Object storage/Cloudinary assets, OCR/face-match service, proof images"],
  ];
  tech.forEach(([h, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    card(s, 0.85 + col * 5.95, 1.52 + row * 1.55, 5.45, 1.08, h, b, [C.green, C.blue, C.orange, C.green2, C.red, C.slate][i]);
  });
}

// 13
{
  const s = addSlide(); title(s, "Database/domain model", "CSDL được chia theo domain; dữ liệu vị trí dùng PostGIS, public ID dùng UUID."); addFooter(s, 13);
  card(s, 0.78, 1.55, 2.75, 1.25, "Identity", "users, refresh_tokens, provider/receiver/volunteer profiles, waiver", C.green);
  card(s, 3.82, 1.55, 2.75, 1.25, "Food sharing", "food_listings, reservations, deliveries, bulk_runs, ratings", C.orange);
  card(s, 6.86, 1.55, 2.75, 1.25, "Campaign kitchen", "kitchen_campaigns, shifts, assignments, recipes, menu, distribution", C.blue);
  card(s, 9.9, 1.55, 2.75, 1.25, "Governance", "trust history, reports, notifications, audit_logs, system_configs, ESG", C.red);
  screenshotSlot(s, "Dán ảnh ERD từ dbdiagram/draw.io: ưu tiên zoom vào 4 cụm chính, không cần toàn bộ 44 bảng trong 1 ảnh", 1.0, 3.42, 4.25, 1.72);
  screenshotSlot(s, "Ảnh Prisma schema hoặc bảng `food_listings`/`reservations` để giải thích UUID, status, geography, QR", 5.75, 3.42, 4.25, 1.72);
  card(s, 10.45, 3.42, 1.85, 1.72, "Con số", "44 bảng\n29 enum\n71 quan hệ\nPostGIS indexes", C.green2);
}

// 14
{
  const s = addSlide(); title(s, "Checklist ảnh demo nên chụp", "Các ảnh này sẽ làm slide thuyết phục hơn vì hội đồng nhìn thấy hệ thống thật đang chạy."); addFooter(s, 14);
  const shots = [
    "Login/Register + chọn vai trò",
    "Receiver home: tìm đồ ăn gần vị trí",
    "Listing detail + reserve modal",
    "QR reservation sau khi đặt",
    "Provider create listing",
    "Provider scan QR / orders",
    "Volunteer delivery offers + tracking",
    "Charity campaign manage + kitchen dashboard",
    "Admin reports/verification",
    "ESG dashboard + DB/ERD tổng quan",
  ];
  shots.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.9 + col * 5.8, y = 1.55 + row * 0.78;
    slideBullet(s, `${i + 1}. ${t}`, x, y, 5.2);
  });
  card(s, 0.95, 6.03, 11.25, 0.55, "Gợi ý khi chụp", "Chụp full màn hình, zoom 100%, dữ liệu demo có tên món/địa chỉ rõ, tránh che các trạng thái quan trọng như active, confirmed, picked_up, delivered.", C.green);
}

function slideBullet(slide, text, x, y, w) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.45, rectRadius: 0.04, fill: { color: C.white }, line: { color: C.line, width: 1 } });
  slide.addText(text, { x: x + 0.16, y: y + 0.135, w: w - 0.32, h: 0.12, fontSize: 8.8, color: C.ink, bold: true, margin: 0 });
}

// 15
{
  const s = addSlide(); title(s, "Thông điệp kết luận", "FoodResQ không chỉ là app đặt đồ ăn miễn phí; đây là hệ thống điều phối cứu trợ thực phẩm có kiểm soát."); addFooter(s, 15);
  card(s, 0.9, 1.65, 3.25, 2.8, "Giá trị nghiệp vụ", "Tạo cầu nối realtime giữa nguồn thực phẩm dư và người cần hỗ trợ; mở rộng sang bếp chiến dịch và phân phối số lượng lớn.", C.green);
  card(s, 4.55, 1.65, 3.25, 2.8, "Giá trị kỹ thuật", "Giải quyết vị trí, cạnh tranh số lượng, realtime, queue, xác thực QR/face, trust score và audit trên một kiến trúc rõ ràng.", C.blue);
  card(s, 8.2, 1.65, 3.25, 2.8, "Giá trị bảo vệ", "Có luồng demo cụ thể, cơ chế chống lạm dụng, database domain rõ và công nghệ phù hợp với yêu cầu capstone.", C.orange);
  s.addText("Q&A", { x: 5.22, y: 5.28, w: 2.9, h: 0.62, fontSize: 31, bold: true, color: C.green, align: "center", margin: 0 });
}

await pptx.writeFile({ fileName: outFile });
console.log(outFile);
