/**
 * Tính nhu cầu nhân sự của chiến dịch bếp ăn theo CA, không theo tổng lượt.
 *
 * Vì sao cần: một tình nguyện viên có thể nhận nhiều ca miễn là các ca đó không
 * trùng giờ (đầu bếp làm cả ngày, hoặc nhận ca sơ chế + ca nấu chính). Nếu cộng
 * dồn `slotsNeeded` của mọi ca rồi gọi đó là "số người" thì con số bị thổi lên
 * đúng bằng số ca mỗi người nhận, và gợi ý nhân sự sẽ sai theo.
 *
 * Hai con số khác nhau về bản chất:
 *   - `slots`  — tổng LƯỢT CA cần lấp (một người nhận 2 ca thì tính 2 lượt).
 *   - `peak`   — số NGƯỜI tối thiểu: lúc đông nhất có bao nhiêu ca chạy song song
 *                thì cần bấy nhiêu người, vì một người không ở hai nơi cùng lúc.
 *
 * Số người hợp lệ của một vai trò luôn nằm trong khoảng [peak, slots].
 */

export type StaffRole = 'chef' | 'waiter' | 'shipper';

export interface ShiftLike {
  role?: StaffRole;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
}

export interface RoleDemand {
  /** Tổng lượt ca cần lấp cho vai trò này */
  slots: number;
  /** Số người tối thiểu — số ca chạy song song lúc cao điểm */
  peak: number;
  /** Số ca có khai báo slot cho vai trò này */
  shiftCount: number;
}

/** `"08:00"` / `"08:00:00"` → số phút từ 00:00. Chuỗi hỏng → null. */
export function timeToMinute(t: string | undefined | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Số ca chạy song song nhiều nhất (tính theo slot), quét qua các mốc bắt đầu.
 *
 * Ca kết thúc đúng lúc ca sau bắt đầu (10:00–12:00 và 12:00–14:00) KHÔNG tính là
 * chồng nhau — một người bàn giao xong là đi tiếp được.
 */
export function peakConcurrent(shifts: ShiftLike[]): number {
  const spans = shifts
    .map((s) => ({
      start: timeToMinute(s.startTime),
      end: timeToMinute(s.endTime),
      slots: Math.max(s.slotsNeeded || 0, 0),
    }))
    .filter((s): s is { start: number; end: number; slots: number } => {
      // Ca thiếu giờ hoặc giờ đảo ngược thì không xác định được chồng lấn — bỏ qua
      // ở đây, phần validate của form đã bắt lỗi đó riêng.
      return s.start !== null && s.end !== null && s.end > s.start && s.slots > 0;
    });

  if (spans.length === 0) return 0;

  // Cực đại chỉ có thể rơi vào một mốc BẮT ĐẦU nào đó — không cần quét từng phút.
  let peak = 0;
  for (const probe of spans) {
    const at = spans.reduce(
      (sum, s) => (s.start <= probe.start && probe.start < s.end ? sum + s.slots : sum),
      0,
    );
    if (at > peak) peak = at;
  }
  return peak;
}

/** Nhu cầu theo từng vai trò + tổng hợp toàn chiến dịch. */
export function staffingDemand(shifts: ShiftLike[]): {
  byRole: Record<StaffRole, RoleDemand>;
  totalSlots: number;
  /** Số người tối thiểu toàn chiến dịch — cộng peak của từng vai trò, vì một người
   *  chỉ làm đúng chuyên môn của mình, không thay thế chéo vai trò được. */
  totalPeak: number;
  shiftCount: number;
} {
  const roles: StaffRole[] = ['chef', 'waiter', 'shipper'];
  const byRole = {} as Record<StaffRole, RoleDemand>;

  for (const role of roles) {
    // Ca không gán vai trò (`role` rỗng) là ca chung — ai cũng đăng ký được, nên
    // tính vào nhu cầu của mọi vai trò sẽ thổi phồng. Chỉ lấy ca gán đúng vai trò.
    const own = shifts.filter((s) => s.role === role && (s.slotsNeeded || 0) > 0);
    byRole[role] = {
      slots: own.reduce((sum, s) => sum + (s.slotsNeeded || 0), 0),
      peak: peakConcurrent(own),
      shiftCount: own.length,
    };
  }

  return {
    byRole,
    totalSlots: shifts.reduce((sum, s) => sum + (s.slotsNeeded || 0), 0),
    totalPeak: roles.reduce((sum, r) => sum + byRole[r].peak, 0),
    shiftCount: shifts.length,
  };
}

/**
 * Ngưỡng nhân sự tối thiểu theo số suất (~1 người / 12–15 suất).
 * Đây là số NGƯỜI CÓ MẶT cùng lúc, không phải tổng lượt ca.
 */
export function recommendedHeadcount(expectedServings: number): number {
  if (expectedServings < 50) return 4;
  if (expectedServings <= 200) return 8;
  return Math.max(14, Math.ceil(expectedServings / 15));
}

export type StaffingTone = 'rose' | 'amber' | 'emerald';

export interface StaffingVerdict {
  tone: StaffingTone;
  icon: string;
  text: string;
  /** Dòng phụ giải thích quan hệ người ↔ ca, chỉ có khi chiến dịch đã khai báo ca */
  hint?: string;
  /**
   * Số người đề xuất cho từng vai trò, chỉ có khi số đang đặt KHÔNG khớp với ca.
   *
   * Chèn mẫu ca KHÔNG tự cộng vào 3 stepper (đó là hai đại lượng khác nhau: ca là
   * lượt, stepper là người), nên đưa sẵn con số để tổ chức áp dụng bằng một cú bấm
   * thay vì tự cộng tay.
   */
  suggested?: Record<StaffRole, number>;
}

/**
 * Kết luận về nhân sự, có tính tới số ca đã khai báo.
 *
 * `planned` là con số ở 3 stepper (tổng người tổ chức định tuyển cho mỗi vai trò).
 * Khi đã có ca, con số đó phải nằm trong [peak, slots] của vai trò tương ứng:
 *   - dưới `peak`  → giờ cao điểm không đủ người, có ca sẽ trống
 *   - trên `slots` → tuyển dư, sẽ có người không có ca nào để nhận
 */
export function staffingVerdict(
  planned: Record<StaffRole, number>,
  shifts: ShiftLike[],
  expectedServings: number,
): StaffingVerdict {
  const roles: StaffRole[] = ['chef', 'waiter', 'shipper'];
  const roleVN: Record<StaffRole, string> = {
    chef: 'đầu bếp',
    waiter: 'phục vụ',
    shipper: 'giao hàng',
  };
  const total = roles.reduce((sum, r) => sum + (planned[r] || 0), 0);
  const demand = staffingDemand(shifts);
  const min = recommendedHeadcount(expectedServings);

  if (total === 0) {
    return {
      tone: 'amber',
      icon: 'priority_high',
      text: 'Chưa có nhân sự — tăng stepper bên trên để chuẩn bị nhân lực.',
    };
  }

  // Chưa khai báo ca → chưa suy ra được ai làm mấy ca, chỉ so với quy mô suất ăn.
  if (demand.shiftCount === 0) {
    if (total < min) {
      return {
        tone: 'amber',
        icon: 'group_remove',
        text: `Tổng ${total} người — khá mỏng cho ${expectedServings} suất (khuyến nghị ≥ ${min}).`,
        hint: 'Thêm ca trực bên dưới để hệ thống tính chính xác hơn — một người có thể nhận nhiều ca không trùng giờ.',
      };
    }
    if (total > min * 2.5) {
      return {
        tone: 'rose',
        icon: 'group_add',
        text: `Tổng ${total} người — có thể thừa cho ${expectedServings} suất (khuyến nghị ≤ ${Math.ceil(min * 2.5)}).`,
      };
    }
    return {
      tone: 'emerald',
      icon: 'check_circle',
      text: `Tổng ${total} người — phù hợp với quy mô ${expectedServings} suất.`,
      hint: 'Thêm ca trực bên dưới để chia người theo khung giờ.',
    };
  }

  // Số đề xuất = cao điểm của vai trò đó (đủ người cho lúc đông nhất), nhưng giữ
  // nguyên con số tổ chức đang đặt nếu nó đã nằm trong khoảng hợp lệ.
  const suggest = (): Record<StaffRole, number> => {
    const out = {} as Record<StaffRole, number>;
    for (const r of roles) {
      const { peak, slots, shiftCount } = demand.byRole[r];
      const cur = planned[r] || 0;
      if (shiftCount === 0) out[r] = cur;
      else if (cur < peak) out[r] = peak;
      else if (cur > slots) out[r] = slots;
      else out[r] = cur;
    }
    return out;
  };

  // Đã có ca → đối chiếu từng vai trò với khoảng [peak, slots].
  const short = roles.filter((r) => demand.byRole[r].peak > (planned[r] || 0));
  if (short.length > 0) {
    const detail = short
      .map((r) => `${roleVN[r]} cần ≥ ${demand.byRole[r].peak} (đang ${planned[r] || 0})`)
      .join(', ');
    return {
      tone: 'amber',
      icon: 'group_remove',
      text: `Giờ cao điểm thiếu người: ${detail}.`,
      hint: `Lúc đông nhất có ${demand.totalPeak} ca chạy song song — một người không thể nhận hai ca trùng giờ.`,
      suggested: suggest(),
    };
  }

  const over = roles.filter(
    (r) => demand.byRole[r].shiftCount > 0 && (planned[r] || 0) > demand.byRole[r].slots,
  );
  if (over.length > 0) {
    const detail = over
      .map((r) => `${roleVN[r]} chỉ có ${demand.byRole[r].slots} lượt ca (đang tuyển ${planned[r]})`)
      .join(', ');
    return {
      tone: 'rose',
      icon: 'group_add',
      text: `Tuyển dư so với số ca: ${detail}.`,
      hint: 'Người dư sẽ không có ca nào để nhận — giảm số tuyển hoặc thêm ca.',
      suggested: suggest(),
    };
  }

  if (total < min) {
    return {
      tone: 'amber',
      icon: 'group_remove',
      text: `Tổng ${total} người — khá mỏng cho ${expectedServings} suất (khuyến nghị ≥ ${min}).`,
      hint: `${demand.totalSlots} lượt ca / ${total} người ≈ mỗi người ${roundShifts(demand.totalSlots, total)} ca.`,
    };
  }

  return {
    tone: 'emerald',
    icon: 'check_circle',
    text: `Tổng ${total} người cho ${demand.shiftCount} ca — phù hợp với quy mô ${expectedServings} suất.`,
    hint: `${demand.totalSlots} lượt ca / ${total} người ≈ mỗi người ${roundShifts(demand.totalSlots, total)} ca · cao điểm cần ${demand.totalPeak} người có mặt.`,
  };
}

function roundShifts(slots: number, people: number): string {
  if (people <= 0) return '0';
  const v = slots / people;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
