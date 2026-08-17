import { z } from 'zod';

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .email('Địa chỉ email không hợp lệ')
    .min(5, 'Email phải có ít nhất 5 ký tự'),
  password: z
    .string()
    .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
    .max(50, 'Mật khẩu tối đa 50 ký tự'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Register form validation schema
 */
export const registerSchema = z
  .object({
    email: z
      .string()
      .email('Địa chỉ email không hợp lệ')
      .min(5, 'Email phải có ít nhất 5 ký tự'),
    password: z
      .string()
      .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
      .max(50, 'Mật khẩu tối đa 50 ký tự'),
    confirmPassword: z.string(),
    name: z
      .string()
      .min(2, 'Họ tên phải có ít nhất 2 ký tự')
      .max(50, 'Họ tên tối đa 50 ký tự'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Sign Up Basic Info (Step 1) validation schema
 */
export const signUpBasicInfoSchema = z
  .object({
    email: z
      .string()
      .email('Địa chỉ email không hợp lệ')
      .min(5, 'Email phải có ít nhất 5 ký tự'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
      .max(50, 'Mật khẩu tối đa 50 ký tự')
      .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ hoa')
      .regex(/[0-9]/, 'Mật khẩu phải có ít nhất 1 chữ số'),
    confirmPassword: z.string(),
    name: z
      .string()
      .min(2, 'Họ tên phải có ít nhất 2 ký tự')
      .max(50, 'Họ tên tối đa 50 ký tự'),
    phone: z
      .string()
      .regex(/^0[35789][0-9]{8}$/, 'Số điện thoại Việt Nam không hợp lệ'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type SignUpBasicInfoInput = z.infer<typeof signUpBasicInfoSchema>;

/**
 * Sign Up Recipient Info (Step 2) validation schema
 */
export const signUpRecipientInfoSchema = z
  .object({
    recipientType: z.enum(['individual', 'charity']),
    idNumber: z.string().optional(),
    organizationName: z.string().optional(),
    taxId: z.string().optional(),
    address: z.string().min(10, 'Địa chỉ phải có ít nhất 10 ký tự'),
  })
  .refine(
    (data) => {
      if (data.recipientType === 'individual') {
        return !!data.idNumber && data.idNumber.length > 0;
      }
      return (
        !!data.organizationName &&
        data.organizationName.length > 0 &&
        !!data.taxId &&
        data.taxId.length > 0
      );
    },
    {
      message: 'Vui lòng điền đầy đủ thông tin theo loại người nhận',
      path: ['recipientType'],
    }
  );

export type SignUpRecipientInfoInput = z.infer<typeof signUpRecipientInfoSchema>;

/**
 * OTP Verification validation schema
 */
export const otpVerificationSchema = z.object({
  otp: z
    .string()
    .min(6, 'Mã xác thực không hợp lệ')
    .max(128, 'Mã xác thực không hợp lệ'),
  // email là metadata truyền qua prop (không bắt buộc) — verify thực ở backend.
  email: z.string().optional(),
});

export type OtpVerificationInput = z.infer<typeof otpVerificationSchema>;

/**
 * Reset Password validation schema
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
      .max(50, 'Mật khẩu tối đa 50 ký tự')
      .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ hoa')
      .regex(/[0-9]/, 'Mật khẩu phải có ít nhất 1 chữ số'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Forgot Password validation schema
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Địa chỉ email không hợp lệ')
    .min(5, 'Email phải có ít nhất 5 ký tự'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Cập nhật hồ sơ (PATCH /users/me). Mọi field optional — chỉ gửi field thay đổi.
 * Ràng buộc khớp UpdateMeDto backend: phone theo định dạng di động VN, avatarUrl là URL.
 */
export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Họ tên phải có ít nhất 2 ký tự')
    .max(255, 'Họ tên không vượt quá 255 ký tự'),
  // Cho phép để trống (không đổi/không có); nếu nhập thì phải đúng định dạng VN.
  phone: z
    .string()
    .regex(/^0[35789][0-9]{8}$/, 'Số điện thoại không hợp lệ (vd 0912345678)')
    .or(z.literal('')),
  avatarUrl: z
    .string()
    .url('Đường dẫn ảnh không hợp lệ')
    .or(z.literal('')),
  address: z.string().optional(),
});

export type UpdateProfileFormInput = z.infer<typeof updateProfileSchema>;

/**
 * Tạo tin thực phẩm (provider) — khớp CreateListingDto backend.
 * Các field thời gian dùng Date (từ datetimepicker), convert ISO khi submit.
 */

const VALID_CATEGORY_KEYS = [
  'cooked_meal', 'bakery', 'fresh_fruit', 'beverage',
  'vegetables', 'raw_protein', 'dry_goods', 'canned_packaged', 'other',
] as const;

/** Đơn vị đếm rời rạc — quantityTotal phải là số nguyên. */
const DISCRETE_UNITS = ['portion', 'item', 'box'] as const;

const optionalPositive = z.preprocess(
  (v) => (v === '' || v == null ? undefined : Number(v)),
  z.number().positive('Phải là số dương').optional()
);

/**
 * Factory nhận `now` để unit test kiểm soát thời gian.
 * Trong production dùng `createListingSchema` (export bên dưới).
 */
export function makeCreateListingSchema(now: Date = new Date()) {
  return z
    .object({
      title: z.string().min(1, 'Nhập tiêu đề').max(255, 'Tối đa 255 ký tự'),
      categories: z
        .array(z.string().min(1))
        .min(1, 'Chọn ít nhất 1 loại thực phẩm')
        .refine(
          (arr) => arr.every((k) => (VALID_CATEGORY_KEYS as readonly string[]).includes(k)),
          { message: 'Loại thực phẩm không hợp lệ' }
        ),
      categoryOtherLabel: z.string().max(100, 'Tối đa 100 ký tự').optional(),
      quantityTotal: z.coerce
        .number()
        .positive('Số lượng phải lớn hơn 0')
        .max(10000, 'Tối đa 10 000'),
      quantityUnit: z.string().min(1, 'Chọn đơn vị'),
      maxPerReservation: z.coerce
        .number()
        .int('Phải là số nguyên')
        .min(1, 'Tối thiểu 1')
        .max(10, 'Tối đa 10'),
      pickupStartTime: z.date().optional(),
      pickupEndTime: z.date().optional(),
      expiryTime: z.date().optional(),
      pickupAddress: z.string().min(1, 'Nhập địa chỉ lấy hàng'),
      description: z.string().optional(),
      weightPerUnitKg: optionalPositive,
      storageConditions: z.string().optional(),
      allergenNotes: z.string().optional(),
    })
    .refine(
      (d) => {
        if (!d.categories.includes('other')) return true;
        const label = d.categoryOtherLabel?.trim() ?? '';
        return label.length >= 3;
      },
      { message: 'Nhập mô tả loại thực phẩm (ít nhất 3 ký tự)', path: ['categoryOtherLabel'] }
    )
    .refine(
      (d) => {
        if (!d.categoryOtherLabel) return true;
        return /\p{L}/u.test(d.categoryOtherLabel);
      },
      { message: 'Tên thực phẩm phải chứa chữ cái', path: ['categoryOtherLabel'] }
    )
    .refine(
      (d) => d.maxPerReservation <= d.quantityTotal,
      { message: 'Số phần tối đa/lượt không được lớn hơn tổng số lượng', path: ['maxPerReservation'] }
    )
    .refine(
      (d) => {
        if ((DISCRETE_UNITS as readonly string[]).includes(d.quantityUnit)) {
          return Number.isInteger(d.quantityTotal);
        }
        return true;
      },
      { message: 'Số lượng phải là số nguyên cho đơn vị phần/cái/hộp', path: ['quantityTotal'] }
    )
    .refine(
      (d) => !d.pickupStartTime || d.pickupStartTime.getTime() >= now.getTime() - 60_000,
      { message: 'Giờ bắt đầu không được ở quá khứ', path: ['pickupStartTime'] }
    )
    .refine(
      (d) => !d.pickupEndTime || !d.pickupStartTime || d.pickupEndTime > d.pickupStartTime,
      { message: 'Giờ kết thúc phải sau giờ bắt đầu', path: ['pickupEndTime'] }
    )
    .refine(
      (d) => !d.expiryTime || !d.pickupEndTime || d.expiryTime >= d.pickupEndTime,
      { message: 'Hạn dùng phải từ giờ kết thúc lấy trở đi', path: ['expiryTime'] }
    );
}

export const createListingSchema = makeCreateListingSchema();

export type CreateListingFormInput = z.infer<ReturnType<typeof makeCreateListingSchema>>;

/**
 * Thông tin cơ sở khi đăng ký provider (gửi kèm register).
 * businessType khớp enum BusinessType backend. lat/lng lấy từ GPS.
 */
export const signUpProviderSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Nhập tên cơ sở')
    .max(255, 'Tối đa 255 ký tự'),
  businessType: z.enum(['restaurant', 'supermarket', 'bakery', 'hotel', 'other']),
  address: z.string().min(5, 'Nhập địa chỉ cơ sở'),
  phone: z
    .string()
    .regex(/^0[35789][0-9]{8}$/, 'Số điện thoại không hợp lệ (vd 0912345678)')
    .or(z.literal('')),
});

export type SignUpProviderFormInput = z.infer<typeof signUpProviderSchema>;
