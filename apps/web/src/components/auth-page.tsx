"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Leaflet cần window → tắt SSR. Dùng để người dùng kéo ghim chỉnh vị trí chính xác.
const LocationPicker = dynamic(() => import("@/components/map/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-neutral-100 text-neutral-500 text-sm">
      Đang tải bản đồ...
    </div>
  ),
});
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/utils";
import { reverseGeocode } from "@/lib/geocode";
import { useAuthStore } from "@/stores/auth.store";
import CameraCapture from "@/components/shared/CameraCapture";
import { signInWithGoogle, isFirebaseConfigured } from "@/lib/firebase";
import { useUploadVerificationImage } from "@/hooks/useUploadImage";

const GOOGLE_ENABLED = isFirebaseConfigured();

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu phải từ 8 ký tự"),
  remember: z.boolean().default(false),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Họ và tên phải từ 2 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  phone: z.string().regex(/^0[35789][0-9]{8}$/, "Số điện thoại Việt Nam không hợp lệ"),
  password: z
    .string()
    .min(8, "Mật khẩu phải từ 8 ký tự")
    .regex(/(?=.*[A-Z])/, "Cần ít nhất 1 chữ hoa")
    .regex(/(?=.*[0-9])/, "Cần ít nhất 1 chữ số"),
  confirmPassword: z.string().min(8, "Xác nhận mật khẩu phải từ 8 ký tự"),
  role: z.enum(["provider", "receiver", "volunteer", "charity"]),
  
  // Provider fields
  storeName: z.string().optional(),
  providerAddress: z.string().optional(),
  // Provider verification (P3): thêm loại hình + MST + toạ độ + ảnh GPKD
  providerBusinessType: z
    .enum(["restaurant", "supermarket", "bakery", "hotel", "other"])
    .optional(),
  taxCode: z.string().optional(),
  providerDescription: z.string().max(1000).optional(),
  // URL upload trả về là đường dẫn tương đối (/uploads/...) → không dùng .url()
  evidenceUrls: z.array(z.string().min(1)).optional(),

  // Volunteer fields
  volunteerRole: z.string().optional(),
  vehicle: z.string().optional(),
  supportArea: z.string().optional(),

  // Receiver fields
  receiverAddress: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
}).superRefine((data, ctx) => {
  if (data.role === "provider") {
    if (!data.storeName || data.storeName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tên cửa hàng phải từ 2 ký tự",
        path: ["storeName"],
      });
    }
    if (!data.providerAddress || data.providerAddress.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Địa chỉ hoạt động phải từ 5 ký tự",
        path: ["providerAddress"],
      });
    }
    if (data.providerBusinessType && data.providerBusinessType !== "other" && !data.taxCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng nhập mã số thuế (10–13 chữ số) để admin xác minh doanh nghiệp.",
        path: ["taxCode"],
      });
    }
    if (data.taxCode && !/^[0-9]{10,13}$/.test(data.taxCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mã số thuế phải gồm 10–13 chữ số.",
        path: ["taxCode"],
      });
    }
    if (!data.providerBusinessType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn loại hình kinh doanh.",
        path: ["providerBusinessType"],
      });
    }
  } else if (data.role === "charity") {
    if (!data.storeName || data.storeName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tên tổ chức phải từ 2 ký tự",
        path: ["storeName"],
      });
    }
    if (!data.providerAddress || data.providerAddress.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Địa chỉ hoạt động phải từ 5 ký tự",
        path: ["providerAddress"],
      });
    }
  } else if (data.role === "volunteer") {
    if (!data.supportArea || data.supportArea.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng nhập quận/huyện hỗ trợ",
        path: ["supportArea"],
      });
    }
  } else if (data.role === "receiver") {
    if (!data.receiverAddress || data.receiverAddress.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Địa chỉ nhận hỗ trợ phải từ 5 ký tự",
        path: ["receiverAddress"],
      });
    }
  }
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

interface AuthPageProps {
  initialTab: "login" | "register";
}

export default function AuthPage({ initialTab }: AuthPageProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab);
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Receiver: sau khi đăng ký thành công → bước chụp khuôn mặt (eKYC) rồi mới vào app
  // Form đã hợp lệ, chờ chụp khuôn mặt để gửi đăng ký (receiver/volunteer) —
  // tài khoản CHỈ được tạo khi BE xác thực được khuôn mặt trong cùng request.
  const [pendingFaceData, setPendingFaceData] = useState<RegisterFormValues | null>(null);
  // Toạ độ GPS bắt được khi người dùng bấm "Dùng vị trí hiện tại" lúc đăng ký.
  // null = chưa định vị (BE sẽ chỉ lưu địa chỉ dạng text, không lưu location).
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'success' | 'denied'>('idle');
  // Check email trùng real-time (debounce 500ms)
  const [emailExists, setEmailExists] = useState<{ checking: boolean; exists: boolean }>({
    checking: false,
    exists: false,
  });
  // Check phone trùng real-time (debounce 500ms)
  const [phoneExists, setPhoneExists] = useState<{ checking: boolean; exists: boolean }>({
    checking: false,
    exists: false,
  });
  const router = useRouter();

  // 1. Login form setup
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
    reset: resetLoginForm,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  // 2. Register form setup
  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    setValue: setRegisterValue,
    watch: watchRegister,
    reset: resetRegisterForm,
    trigger,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "receiver",
      storeName: "",
      providerAddress: "",
      providerBusinessType: undefined,
      taxCode: "",
      providerDescription: "",
      evidenceUrls: [],
      volunteerRole: "shipper",
      vehicle: "Xe máy",
      supportArea: "",
      receiverAddress: "",
      notes: "",
    },
  });

  const selectedRole = watchRegister("role");
  const watchedEmail = watchRegister("email");
  const watchedPhone = watchRegister("phone");

  // Debounce check email trùng real-time (500ms sau khi ngừng gõ)
  useEffect(() => {
    if (!watchedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmail)) {
      setEmailExists({ checking: false, exists: false });
      return;
    }
    setEmailExists((prev) => ({ ...prev, checking: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await api.post("/auth/check-email", { email: watchedEmail });
        // Support both { data: { exists: true } } and { exists: true }
        const exists = res.data?.data?.exists ?? res.data?.exists ?? false;
        setEmailExists({ checking: false, exists });
      } catch {
        // Nếu API fail, reset state
        setEmailExists({ checking: false, exists: false });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [watchedEmail]);

  // Debounce check phone trùng real-time (500ms sau khi ngừng gõ)
  useEffect(() => {
    if (!watchedPhone || !/^0[35789][0-9]{8}$/.test(watchedPhone)) {
      setPhoneExists({ checking: false, exists: false });
      return;
    }
    setPhoneExists((prev) => ({ ...prev, checking: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await api.post("/auth/check-phone", { phone: watchedPhone });
        const exists = res.data?.data?.exists ?? res.data?.exists ?? false;
        setPhoneExists({ checking: false, exists });
      } catch {
        setPhoneExists({ checking: false, exists: false });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [watchedPhone]);

  const handleNextStep = async () => {
    // Validate Step 1 fields before proceeding
    const isValid = await trigger(["fullName", "email", "phone", "password", "confirmPassword", "role"]);
    if (!isValid) return;

    // Check trùng email/phone trước khi cho qua bước tiếp theo
    const email = watchRegister("email");
    const phone = watchRegister("phone");
    let hasDuplicate = false;

    try {
      // Check email trùng
      if (email) {
        const emailRes = await api.post("/auth/check-email", { email });
        if (emailRes.data?.data?.exists ?? emailRes.data?.exists) {
          setEmailExists({ checking: false, exists: true });
          toast.error("Email này đã được đăng ký. Vui lòng dùng email khác.");
          hasDuplicate = true;
        }
      }

      // Check phone trùng
      if (phone && !hasDuplicate) {
        const phoneRes = await api.post("/auth/check-phone", { phone });
        if (phoneRes.data?.data?.exists ?? phoneRes.data?.exists) {
          setPhoneExists({ checking: false, exists: true });
          toast.error("Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.");
          hasDuplicate = true;
        }
      }
    } catch {
      // Nếu API lỗi thì cho qua (BE sẽ validate lại khi submit)
    }

    if (!hasDuplicate) {
      setRegisterStep(2);
    }
  };

  // Bấm "Dùng vị trí hiện tại": xin GPS → lưu toạ độ → tự điền địa chỉ text.
  const fillCurrentLocation = (
    field: "receiverAddress" | "providerAddress",
  ) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      toast.error("Trình duyệt không hỗ trợ định vị.");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGeoCoords({ lat, lng });
        setGeoStatus("success");
        const address = await reverseGeocode(lat, lng);
        if (address) {
          setRegisterValue(field, address, { shouldValidate: true });
          toast.success("Đã lấy vị trí hiện tại của bạn.");
        } else {
          // Không tra được tên đường → vẫn giữ toạ độ, điền lat/lng để người dùng thấy
          setRegisterValue(field, `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { shouldValidate: true });
          toast.success("Đã lấy toạ độ. Bạn có thể chỉnh lại tên đường nếu cần.");
        }
      },
      () => {
        setGeoStatus("denied");
        toast.error("Không lấy được vị trí. Vui lòng cho phép quyền định vị hoặc nhập tay.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  // Người dùng kéo ghim / bấm trên bản đồ (LocationPicker trả về lng, lat) →
  // cập nhật toạ độ và tự cập nhật lại địa chỉ text cho khớp điểm vừa chọn.
  const handleMapPick = async (
    field: "receiverAddress" | "providerAddress",
    lng: number,
    lat: number,
  ) => {
    setGeoCoords({ lat, lng });
    setGeoStatus("success");
    const address = await reverseGeocode(lat, lng);
    setRegisterValue(field, address ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`, {
      shouldValidate: true,
    });
  };

  const { setTokens, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const uploadEvidence = useUploadVerificationImage();

  const onLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.post<{
        data: {
          accessToken: string;
          refreshToken: string;
          user: Parameters<typeof setUser>[0];
        };
      }>('/auth/login', { email: data.email, password: data.password });
      setTokens(res.data.data.accessToken, res.data.data.refreshToken);
      setUser(res.data.data.user);
      // Xóa sạch cache của user cũ (['users','me', oldId] etc.) trước khi điều hướng → tránh hiển thị nhầm hồ sơ
      queryClient.clear();
      toast.success("Đăng nhập thành công!");
      let redirectUrl = '/listings';
      const role = res.data.data.user.role;
      if (role === 'admin') redirectUrl = '/admin';
      else if (role === 'provider') redirectUrl = '/provider';
      else if (role === 'volunteer') {
        try {
          const volRes = await api.get('/volunteers/me');
          const specs = volRes.data?.data?.specializations || [];
          const isChefOrWaiter = specs.some((s: { specialization?: string }) => s.specialization === 'chef' || s.specialization === 'waiter');
          redirectUrl = isChefOrWaiter ? '/campaigns' : '/deliveries';
        } catch (e) {
          redirectUrl = '/deliveries';
        }
      }
      router.push(redirectUrl);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Đăng nhập thất bại. Kiểm tra lại email hoặc mật khẩu.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const redirectByRole = async (role: string) => {
    let redirectUrl = '/listings';
    if (role === 'admin') redirectUrl = '/admin';
    else if (role === 'provider') redirectUrl = '/provider';
    else if (role === 'volunteer') {
      try {
        const volRes = await api.get('/volunteers/me');
        const specs = volRes.data?.data?.specializations || [];
        const isChefOrWaiter = specs.some((s: { specialization?: string }) => s.specialization === 'chef' || s.specialization === 'waiter');
        redirectUrl = isChefOrWaiter ? '/campaigns' : '/deliveries';
      } catch (e) {
        redirectUrl = '/deliveries';
      }
    }
    router.push(redirectUrl);
  };

  const handleGoogleCredential = async (idToken: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.post<{
        data: { accessToken: string; refreshToken: string; user: Parameters<typeof setUser>[0] };
      }>('/auth/google', { idToken });
      setTokens(res.data.data.accessToken, res.data.data.refreshToken);
      setUser(res.data.data.user);
      // Xóa cache user cũ để chắc chắn hiển thị profile của user vừa đăng nhập
      queryClient.clear();
      toast.success('Đăng nhập Google thành công!');
      redirectByRole(res.data.data.user.role);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Đăng nhập Google thất bại.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mở popup Firebase → lấy ID token → gửi lên backend (/auth/google)
  const handleGoogleSignIn = async () => {
    try {
      const idToken = await signInWithGoogle();
      await handleGoogleCredential(idToken);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // Người dùng tự đóng popup → không báo lỗi
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      toast.error('Không kết nối được Google');
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    // Cá nhân người nhận & tình nguyện viên: eKYC BẮT BUỘC — chụp khuôn mặt TRƯỚC,
    // gửi kèm request đăng ký; BE không nhận diện được mặt thì KHÔNG tạo tài khoản.
    if (data.role === 'receiver' || data.role === 'volunteer') {
      setPendingFaceData(data);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.post<{
        data: {
          accessToken: string;
          refreshToken: string;
          user: Parameters<typeof setUser>[0];
        };
      }>('/auth/register', {
        // Nhánh này chỉ còn provider & charity (receiver/volunteer đã rẽ sang luồng selfie ở trên)
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role === 'charity' ? 'receiver' : data.role,
        isCharityOrg: data.role === 'charity' ? true : undefined,
        businessName: data.storeName || undefined,
        address: data.providerAddress || undefined,
        // Provider verification (P3)
        ...(data.role === 'provider' && {
          businessType: data.providerBusinessType,
          taxCode: data.taxCode || undefined,
          description: data.providerDescription || undefined,
          evidenceUrls: data.evidenceUrls && data.evidenceUrls.length ? data.evidenceUrls : undefined,
          ...(geoCoords ? { lng: geoCoords.lng, lat: geoCoords.lat } : {}),
        }),
      });
      void res; // tokens không dùng ở nhánh này — provider/charity đăng nhập lại sau
      // provider + charity (tổ chức): đăng ký xong vào đăng nhập, không quét mặt
      const waitingMsg =
        data.role === "provider"
          ? "Đăng ký tài khoản NCC thành công! Hồ sơ đang chờ admin duyệt (tối đa 24h). Bạn có thể đăng nhập, các chức năng đăng tin sẽ mở sau khi duyệt."
          : "Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay.";
      toast.success(
        data.role === "provider"
          ? "Đã gửi hồ sơ đăng ký!"
          : "Đăng ký thành công!",
      );
      setSuccessMessage(waitingMsg);
      setTimeout(() => {
        setActiveTab("login");
        setRegisterStep(1);
        resetLoginForm();
        resetRegisterForm();
        setUploadedFile(null);
        setSuccessMessage(null);
      }, 2200);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Đăng ký thất bại. Email hoặc số điện thoại có thể đã được sử dụng.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Gửi đăng ký receiver/volunteer kèm selfie (multipart) — BE xác thực mặt rồi mới tạo tài khoản. */
  const submitWithSelfie = async (photo: File) => {
    if (!pendingFaceData) return;
    const data = pendingFaceData;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const form = new FormData();
      form.append('email', data.email);
      form.append('password', data.password);
      form.append('fullName', data.fullName);
      if (data.phone) form.append('phone', data.phone);
      form.append('role', data.role); // 'receiver' | 'volunteer'
      if (data.role === 'receiver' && data.receiverAddress) form.append('address', data.receiverAddress);
      if (data.role === 'volunteer') {
        if (data.vehicle) form.append('vehicleType', data.vehicle);
        if (data.volunteerRole) form.append('volunteerRole', data.volunteerRole);
      }
      if (geoCoords) {
        form.append('lng', String(geoCoords.lng));
        form.append('lat', String(geoCoords.lat));
      }
      form.append('selfie', photo);

      const res = await api.post<{
        data: { accessToken: string; refreshToken: string; user: Parameters<typeof setUser>[0] };
      }>('/auth/register', form, { headers: { 'Content-Type': 'multipart/form-data' } });

      setPendingFaceData(null);
      toast.success('Đăng ký thành công!');
      setTokens(res.data.data.accessToken, res.data.data.refreshToken);
      setUser(res.data.data.user);

      // Redirect volunteer theo specialization: chef/waiter → campaigns, shipper → deliveries
      const volRole = data.volunteerRole;
      const redirect =
        data.role === 'volunteer' && (volRole === 'chef' || volRole === 'waiter')
          ? '/campaigns'
          : data.role === 'volunteer'
            ? '/deliveries'
            : '/listings';
      router.push(redirect);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Đăng ký thất bại. Vui lòng thử lại.';
      // Giữ modal mở để chụp lại (trường hợp không nhận diện được khuôn mặt)
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-[#FAFBF9]">
      {/* Left Section: Visual & Branding (60% Desktop) */}
      <section className="relative hidden md:flex md:w-[60%] lg:w-[65%] min-h-screen items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            alt="Friendly Bakery"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDDhq1Fly7FtAtk6JjL7x3SSYsGKCiFo2Qxp2OYGYZa59Guab_dPnBOL5MLdqDBcdiCOi2HlT7NgndHTz3XocA3f0tAWc01oiul3OZBR-gxTHI8L1GGY-iyUmXIG_e9HxrYJqlihHln2mwzrO-g49jZreyImS2VYkdTgQ123TKE7BWI7Pu904JrrmMycFxyZh6BpD8F_RbjNpR3whR-8jYOVXrQg8vVP1-m3l84qohZRXsYvVflYKDUolGe1lHqWbaMLDk6PEJ2UXT5"
          />
          {/* Soft Green Overlay */}
          <div className="absolute inset-0 bg-emerald-800/20 backdrop-blur-[2px]"></div>
          {/* Gradient Fade */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface/40"></div>
        </div>
        
        {/* Branding and Value Proposition */}
        <div className="relative z-10 p-12 max-w-[576px] text-white drop-shadow-lg">
          <div className="mb-8">
            <h1 className="font-bold text-4xl text-emerald-400 italic tracking-tight">FoodResQ</h1>
            <div className="h-1 w-16 bg-emerald-100 rounded-full mt-2"></div>
          </div>
đầu bếp
          <h2 className="font-bold text-4xl mb-6 leading-tight">Mọi bữa ăn đều đáng trân trọng.</h2>
          <p className="font-medium text-lg opacity-90 leading-relaxed">
            Tham gia cùng hàng ngàn người hàng xóm chia sẻ thực phẩm dư thừa, giảm thiểu lãng phí và xây dựng một cộng đồng gắn kết hơn.
          </p>
          
          {/* Community Progress Snippet */}
          <div className="mt-12 p-8 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 inline-block w-full max-w-sm">
            <div className="flex items-center gap-6 mb-4">
              <span className="material-symbols-outlined text-emerald-100" style={{ fontVariationSettings: "'FILL' 1" }}>
                volunteer_activism
              </span>
              <span className="font-semibold text-base">12,450+ bữa ăn đã được cứu</span>
            </div>
            <div className="w-full bg-white/20 h-3 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-100 h-full rounded-full shadow-[0_0_15px_rgba(157,234,152,0.5)] transition-all duration-1000"
                style={{ width: "85%" }}
              ></div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Section: Authentication Form (40% Desktop) */}
      <section className="flex-1 bg-[#FAFBF9] flex flex-col px-6 md:px-12 py-12 justify-center items-center overflow-y-auto">
        <div className="w-full max-w-[440px] my-auto">
          {/* Mobile Branding (Logo only visible on mobile) */}
          <div className="md:hidden mb-12 text-center">
            <h1 className="font-bold text-4xl text-emerald-800 italic tracking-tight">FoodResQ</h1>
            <p className="text-neutral-500 text-base mt-2">Kết nối cộng đồng, giảm thiểu lãng phí</p>
          </div>

          {/* Form Header & Toggle */}
          <div className="mb-8">
            <h2 className="font-bold text-2xl text-neutral-800 mb-2">
              {activeTab === "login" ? "Chào mừng bạn!" : "Đăng ký thành viên"}
            </h2>
            <p className="text-neutral-500 font-medium mb-6">
              {activeTab === "login" 
                ? "Hãy bắt đầu hành trình chia sẻ thực phẩm ngay hôm nay." 
                : "Tạo tài khoản để tham gia mạng lưới cứu trợ thực phẩm."}
            </p>
            
            {/* Toggle Switch */}
            <div className="flex p-1 bg-neutral-100 rounded-full border border-neutral-200/30 relative">
              <button
                type="button"
                className={`flex-1 py-2.5 font-semibold text-base rounded-full transition-all duration-300 relative z-10 ${
                  activeTab === "login" ? "text-emerald-800 font-bold" : "text-neutral-500 hover:text-neutral-800"
                }`}
                onClick={() => {
                  setActiveTab("login");
                  setRegisterStep(1);
                  setUploadedFile(null);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 font-semibold text-base rounded-full transition-all duration-300 relative z-10 ${
                  activeTab === "register" ? "text-emerald-800 font-bold" : "text-neutral-500 hover:text-neutral-800"
                }`}
                onClick={() => {
                  setActiveTab("register");
                  setRegisterStep(1);
                  setUploadedFile(null);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                Đăng ký
              </button>
              
              {/* Sliding Background Indicator */}
              <div
                className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm border border-neutral-200/10 transition-all duration-300 ease-out"
                style={{ 
                  width: "calc(50% - 4px)",
                  left: activeTab === "login" ? "4px" : "50%"
                }}
              />
            </div>
          </div>

          {/* Error and Success Alerts */}
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-6 bg-rose-50 text-rose-700 text-base rounded-xl flex items-start gap-4 border border-error/20"
              >
                <span className="material-symbols-outlined text-rose-600">error</span>
                <span>{errorMessage}</span>
              </motion.div>
            )}
            
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-6 bg-emerald-800 text-white text-base rounded-xl flex items-start gap-4 border border-primary/20"
              >
                <span className="material-symbols-outlined text-emerald-800">check_circle</span>
                <span>{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Auth Form Container with Switch Animation */}
          <div className="relative overflow-hidden min-h-[300px]">
            <AnimatePresence mode="wait">
              {activeTab === "login" ? (
                <motion.form
                  key="login-form"
                  onSubmit={handleLoginSubmit(onLoginSubmit)}
                  className="space-y-5"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Input: Email/Username */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="login-email">
                      Email
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                        mail
                      </span>
                      <input
                        id="login-email"
                        type="email"
                        placeholder="example@email.com"
                        className={`w-full pl-12 pr-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                          loginErrors.email ? "border-error" : "border-neutral-200/30"
                        }`}
                        disabled={isSubmitting}
                        {...registerLogin("email")}
                      />
                    </div>
                    {loginErrors.email && (
                      <p className="text-rose-600 text-sm ml-1 mt-2">{loginErrors.email.message}</p>
                    )}
                  </div>

                  {/* Input: Password */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-1">
                      <label className="font-semibold text-base text-neutral-500" htmlFor="login-password">
                        Mật khẩu
                      </label>
                      <a className="font-medium text-sm text-emerald-800 font-bold hover:underline" href="#">
                        Quên mật khẩu?
                      </a>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                        lock
                      </span>
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className={`w-full pl-12 pr-12 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                          loginErrors.password ? "border-error" : "border-neutral-200/30"
                        }`}
                        disabled={isSubmitting}
                        {...registerLogin("password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-neutral-800 transition-colors"
                      >
                        <span className="material-symbols-outlined select-none">
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                    {loginErrors.password && (
                      <p className="text-rose-600 text-sm ml-1 mt-2">{loginErrors.password.message}</p>
                    )}
                  </div>

                  {/* Remember Me */}
                  <div className="flex items-center gap-2.5 px-1 py-0.5">
                    <input
                      id="remember"
                      type="checkbox"
                      className="w-5 h-5 rounded border-2 border-neutral-200 text-emerald-800 focus:ring-emerald-600 focus:ring-offset-0 cursor-pointer"
                      disabled={isSubmitting}
                      {...registerLogin("remember")}
                    />
                    <label className="font-medium text-neutral-500 select-none cursor-pointer" htmlFor="remember">
                      Ghi nhớ đăng nhập
                    </label>
                  </div>

                  {/* Primary Action */}
                  <button
                    type="submit"
                    className="squishy-button w-full py-3 bg-emerald-800 text-white font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin border-2 border-primary border-t-transparent rounded-full w-5 h-5 mr-2"></span>
                        Đang đăng nhập...
                      </>
                    ) : (
                      <>
                        Đăng nhập
                        <span className="material-symbols-outlined">arrow_forward</span>
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="register-form"
                  onSubmit={handleRegisterSubmit(onRegisterSubmit)}
                  className="space-y-4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Progress Indicator */}
                  <div className="flex items-center justify-between mb-6 px-1 text-sm">
                    <div className={`flex items-center gap-2 ${registerStep === 1 ? "text-emerald-800 font-bold" : "text-neutral-500/70"}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${registerStep === 1 ? "bg-emerald-800 text-white" : "bg-emerald-800 text-white"}`}>1</span>
                      <span>Tài khoản & Vai trò</span>
                    </div>
                    <div className="flex-1 h-0.5 mx-3 bg-outline-variant/30"></div>
                    <div className={`flex items-center gap-2 ${registerStep === 2 ? "text-emerald-800 font-bold" : "text-neutral-500/70"}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${registerStep === 2 ? "bg-emerald-800 text-white" : "bg-neutral-200 text-neutral-500"}`}>2</span>
                      <span>Thông tin chi tiết</span>
                    </div>
                  </div>

                  {registerStep === 1 ? (
                    <>
                      {/* Step 1 Fields */}
                      {/* Input: Full Name */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reg-fullname">
                          Họ và tên
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            person
                          </span>
                          <input
                            id="reg-fullname"
                            type="text"
                            placeholder="Nguyễn Văn A"
                            className={`w-full pl-12 pr-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                              registerErrors.fullName ? "border-error" : "border-neutral-200/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("fullName")}
                          />
                        </div>
                        {registerErrors.fullName && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.fullName.message}</p>
                        )}
                      </div>

                      {/* Input: Email */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reg-email">
                          Email
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            mail
                          </span>
                          <input
                            id="reg-email"
                            type="email"
                            placeholder="example@email.com"
                            className={`w-full pl-12 pr-10 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                              registerErrors.email || emailExists.exists
                                ? "border-error"
                                : "border-neutral-200/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("email")}
                          />
                          {/* Check icon hoặc loading spinner */}
                          {watchedEmail && !registerErrors.email && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2">
                              {emailExists.checking ? (
                                <span className="animate-spin material-symbols-outlined text-neutral-400 text-lg">progress_activity</span>
                              ) : emailExists.exists ? (
                                <span className="material-symbols-outlined text-rose-500 text-lg">error</span>
                              ) : (
                                <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                              )}
                            </span>
                          )}
                        </div>
                        {registerErrors.email && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.email.message}</p>
                        )}
                        {emailExists.exists && !registerErrors.email && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">
                            Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.
                          </p>
                        )}
                      </div>

                      {/* Input: Phone */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reg-phone">
                          Số điện thoại
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            call
                          </span>
                          <input
                            id="reg-phone"
                            type="text"
                            placeholder="0912345678"
                            className={`w-full pl-12 pr-10 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                              registerErrors.phone || phoneExists.exists
                                ? "border-error"
                                : "border-neutral-200/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("phone")}
                          />
                          {watchedPhone && !registerErrors.phone && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2">
                              {phoneExists.checking ? (
                                <span className="animate-spin material-symbols-outlined text-neutral-400 text-lg">progress_activity</span>
                              ) : phoneExists.exists ? (
                                <span className="material-symbols-outlined text-rose-500 text-lg">error</span>
                              ) : (
                                <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                              )}
                            </span>
                          )}
                        </div>
                        {registerErrors.phone && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.phone.message}</p>
                        )}
                        {phoneExists.exists && !registerErrors.phone && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">
                            Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.
                          </p>
                        )}
                      </div>

                      {/* Input: Role Selection */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-base text-neutral-500 ml-1">
                          Vai trò tham gia
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "receiver")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-neutral-100 text-center ${
                              selectedRole === "receiver" 
                                ? "border-primary bg-emerald-800/5 text-emerald-800" 
                                : "border-neutral-200/30 text-neutral-500"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">person_pin</span>
                            <span className="font-medium text-[11px] leading-tight font-semibold">Người Nhận</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "provider")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-neutral-100 text-center ${
                              selectedRole === "provider" 
                                ? "border-primary bg-emerald-800/5 text-emerald-800" 
                                : "border-neutral-200/30 text-neutral-500"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">storefront</span>
                            <span className="font-medium text-[11px] leading-tight font-semibold">Cửa Hàng</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "charity")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-neutral-100 text-center ${
                              selectedRole === "charity" 
                                ? "border-primary bg-emerald-800/5 text-emerald-800" 
                                : "border-neutral-200/30 text-neutral-500"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">diversity_1</span>
                            <span className="font-medium text-[11px] leading-tight font-semibold">Tổ Chức Từ Thiện</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "volunteer")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-neutral-100 text-center ${
                              selectedRole === "volunteer" 
                                ? "border-primary bg-emerald-800/5 text-emerald-800" 
                                : "border-neutral-200/30 text-neutral-500"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">volunteer_activism</span>
                            <span className="font-medium text-[11px] leading-tight font-semibold">Tình Nguyện</span>
                          </button>
                        </div>
                      </div>

                      {/* Input: Password */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reg-password">
                          Mật khẩu
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            lock
                          </span>
                          <input
                            id="reg-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className={`w-full pl-12 pr-12 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                              registerErrors.password ? "border-error" : "border-neutral-200/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("password")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-neutral-800 transition-colors"
                          >
                            <span className="material-symbols-outlined select-none">
                              {showPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                        {registerErrors.password && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.password.message}</p>
                        )}
                      </div>

                      {/* Input: Confirm Password */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reg-confirmpass">
                          Xác nhận mật khẩu
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            lock
                          </span>
                          <input
                            id="reg-confirmpass"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className={`w-full pl-12 pr-12 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                              registerErrors.confirmPassword ? "border-error" : "border-neutral-200/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("confirmPassword")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-neutral-800 transition-colors"
                          >
                            <span className="material-symbols-outlined select-none">
                              {showConfirmPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                        {registerErrors.confirmPassword && (
                          <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.confirmPassword.message}</p>
                        )}
                      </div>

                      {/* Next Button */}
                      <button
                        type="button"
                        onClick={handleNextStep}
                        disabled={emailExists.exists || emailExists.checking || phoneExists.exists || phoneExists.checking}
                        className="squishy-button w-full py-3 bg-emerald-800 text-white font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {emailExists.checking ? (
                          <>
                            <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5 mr-2"></span>
                            Đang kiểm tra email...
                          </>
                        ) : (
                          <>
                            Tiếp tục
                            <span className="material-symbols-outlined">arrow_forward</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Step 2: Role Specific Form */}
                      {(selectedRole === "provider" || selectedRole === "charity") && (
                        <div className="space-y-4">
                          {/* Store Name */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="store-name">
                              {selectedRole === "charity" ? "Tên tổ chức/cơ sở" : "Tên cửa hàng/doanh nghiệp"}
                            </label>
                            <input
                              id="store-name"
                              type="text"
                              placeholder={selectedRole === "charity" ? "Ví dụ: Tổ chức Trăng Khuyết" : "Ví dụ: Bakery Fresh"}
                              className={`w-full px-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                                registerErrors.storeName ? "border-error" : "border-neutral-200/30"
                              }`}
                              disabled={isSubmitting}
                              {...registerSignup("storeName")}
                            />
                            {registerErrors.storeName && (
                              <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.storeName.message}</p>
                            )}
                          </div>

                          {/* Provider: loại hình kinh doanh (P3) */}
                          {selectedRole === "provider" && (
                            <div className="space-y-1.5">
                              <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="provider-business-type">
                                Loại hình kinh doanh <span className="text-rose-600">*</span>
                              </label>
                              <select
                                id="provider-business-type"
                                className={`w-full px-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none appearance-none ${
                                  registerErrors.providerBusinessType ? "border-error" : "border-neutral-200/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("providerBusinessType")}
                              >
                                <option value="">-- Chọn loại hình --</option>
                                <option value="restaurant">🍜 Nhà hàng / Quán ăn</option>
                                <option value="supermarket">🛒 Siêu thị / Cửa hàng tiện lợi</option>
                                <option value="bakery">🥖 Tiệm bánh</option>
                                <option value="hotel">🏨 Khách sạn / Resort</option>
                                <option value="other">📦 Khác (cá nhân / hộ gia đình)</option>
                              </select>
                              {registerErrors.providerBusinessType && (
                                <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.providerBusinessType.message}</p>
                              )}
                            </div>
                          )}

                          {/* Provider: MST (P3) */}
                          {selectedRole === "provider" && (
                            <div className="space-y-1.5">
                              <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="tax-code">
                                Mã số thuế <span className="text-rose-600">*</span>
                              </label>
                              <input
                                id="tax-code"
                                type="text"
                                inputMode="numeric"
                                placeholder="Ví dụ: 0312345678"
                                className={`w-full px-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                                  registerErrors.taxCode ? "border-error" : "border-neutral-200/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("taxCode")}
                              />
                              {registerErrors.taxCode && (
                                <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.taxCode.message}</p>
                              )}
                            </div>
                          )}

                          {/* Provider: mô tả ngắn (P3) */}
                          {selectedRole === "provider" && (
                            <div className="space-y-1.5">
                              <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="provider-description">
                                Mô tả ngắn về cửa hàng
                              </label>
                              <textarea
                                id="provider-description"
                                rows={3}
                                placeholder="Ví dụ: Chuyên cơm văn phòng, mở cửa 10h–14h mỗi ngày..."
                                className="w-full px-4 py-3 bg-white border-2 border-neutral-200/30 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant resize-none"
                                disabled={isSubmitting}
                                {...registerSignup("providerDescription")}
                              />
                            </div>
                          )}

                          {/* Provider: ảnh minh chứng (P3) — GPKD + mặt tiền + biển hiệu */}
                          {selectedRole === "provider" && (() => {
                            const evidenceUrls: string[] = (watchRegister("evidenceUrls") ?? []) as string[];
                            const setEvidence = (urls: string[]) =>
                              setRegisterValue("evidenceUrls", urls, { shouldValidate: true });
                            return (
                            <div className="space-y-2">
                              <label className="font-semibold text-base text-neutral-500 ml-1">
                                Ảnh minh chứng (giấy phép / mặt tiền / biển hiệu)
                              </label>

                              {/* Danh sách URL đã upload */}
                              <div className="grid grid-cols-3 gap-2">
                                {evidenceUrls.map((u: string, idx: number) => (
                                  <div key={`${u}-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-neutral-200/40 bg-neutral-50">
                                    {/* Ảnh lưu ở API (/uploads/...) — phải ghép origin :3001, để trần sẽ 404 vì trỏ vào :3000 */}
                                    <img src={mediaUrl(u)} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEvidence(evidenceUrls.filter((_, i) => i !== idx))
                                      }
                                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-black/80"
                                      aria-label="Xoá ảnh"
                                    >
                                      ✕
                                    </button>
                                    {idx === 0 && (
                                      <span className="absolute bottom-1 left-1 text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded">
                                        GPKD
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <label className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-neutral-200/60 rounded-xl text-sm font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer disabled:opacity-50">
                                <span className="material-symbols-outlined text-base">add_photo_alternate</span>
                                {uploadEvidence.isPending ? "Đang upload..." : "Thêm ảnh"}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  multiple
                                  className="hidden"
                                  disabled={isSubmitting || uploadEvidence.isPending}
                                  onChange={async (e) => {
                                    const files = Array.from(e.target.files ?? []);
                                    if (!files.length) return;
                                    try {
                                      const urls: string[] = [];
                                      for (const f of files) {
                                        const u = await uploadEvidence.uploadVerificationImage(f);
                                        urls.push(u);
                                      }
                                      setEvidence([...evidenceUrls, ...urls]);
                                      toast.success(`Đã upload ${urls.length} ảnh.`);
                                    } catch {
                                      toast.error("Upload ảnh thất bại. Vui lòng thử lại.");
                                    } finally {
                                      e.target.value = "";
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            );
                          })()}


                          {/* Address */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="provider-address">
                              Địa chỉ hoạt động
                            </label>
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                                location_on
                              </span>
                              {/* Chỉ đọc: địa chỉ luôn lấy theo ghim trên bản đồ (reverse geocode)
                                  để chữ và toạ độ không lệch nhau — không cho gõ tay. */}
                              <input
                                id="provider-address"
                                type="text"
                                readOnly
                                placeholder="Bấm nút định vị bên dưới hoặc ghim trên bản đồ"
                                className={`w-full pl-12 pr-4 py-3 bg-neutral-50 border-2 rounded-xl focus:ring-0 transition-all font-medium outline-none cursor-default placeholder:text-outline-variant ${
                                  registerErrors.providerAddress ? "border-error" : "border-neutral-200/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("providerAddress")}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => fillCurrentLocation("providerAddress")}
                              disabled={isSubmitting || geoStatus === "locating"}
                              className="flex items-center gap-1.5 ml-1 mt-1 text-sm font-semibold text-emerald-800 hover:underline disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-base">
                                {geoStatus === "locating" ? "progress_activity" : "my_location"}
                              </span>
                              {geoStatus === "locating"
                                ? "Đang lấy vị trí..."
                                : geoStatus === "success" && geoCoords
                                  ? "Đã ghim vị trí — bấm để cập nhật"
                                  : "Dùng vị trí hiện tại của cửa hàng"}
                            </button>
                            {geoCoords && (
                              <div className="mt-2 space-y-1">
                                <div className="h-48 w-full rounded-xl overflow-hidden border-2 border-neutral-200/30">
                                  <LocationPicker
                                    lng={geoCoords.lng}
                                    lat={geoCoords.lat}
                                    onPick={(lng, lat) => void handleMapPick("providerAddress", lng, lat)}
                                  />
                                </div>
                                <p className="text-xs text-neutral-500 ml-1">
                                  Kéo ghim hoặc bấm trên bản đồ để chỉnh đúng vị trí hoạt động.
                                </p>
                              </div>
                            )}
                            {registerErrors.providerAddress && (
                              <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.providerAddress.message}</p>
                            )}
                          </div>

                          {/* Business License Upload */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1">
                              {selectedRole === "charity" ? "Giấy phép hoạt động (Ảnh chụp)" : "Giấy phép kinh doanh (Ảnh chụp)"}
                            </label>
                            <div className="relative">
                              <input
                                type="file"
                                id="license-upload"
                                accept="image/*"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setUploadedFile(e.target.files[0].name);
                                  }
                                }}
                                className="hidden"
                                disabled={isSubmitting}
                              />
                              <label
                                htmlFor="license-upload"
                                className="border-2 border-dashed border-neutral-200/50 rounded-xl p-6 flex flex-col items-center justify-center bg-neutral-100 hover:bg-neutral-200-high hover:border-primary/50 transition-all cursor-pointer group text-center"
                              >
                                <span className="material-symbols-outlined text-outline-variant group-hover:text-emerald-800 mb-2 transition-colors">
                                  cloud_upload
                                </span>
                                <span className="text-neutral-500 font-semibold text-base">
                                  {uploadedFile ? uploadedFile : "Nhấn để tải lên hoặc kéo thả tệp"}
                                </span>
                                <span className="text-outline-variant text-xs mt-1">PNG, JPG tối đa 5MB</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedRole === "volunteer" && (
                        <div className="space-y-4">
                          {/* Volunteer Role */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="volunteer-role">
                              Vị trí tình nguyện
                            </label>
                            <select
                              id="volunteer-role"
                              className="w-full px-4 py-3 bg-white border-2 border-neutral-200/30 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none appearance-none"
                              disabled={isSubmitting}
                              {...registerSignup("volunteerRole")}
                            >
                              <option value="shipper">Người giao hàng (Shipper)</option>
                              <option value="chef">Đầu bếp (Chef)</option>
                              <option value="waiter">Phục vụ (Waiter)</option>
                            </select>
                          </div>

                          {/* Vehicle */}
                      

                          {/* Support Area */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="support-area">
                              Khu vực hỗ trợ hoạt động
                            </label>
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                                my_location
                              </span>
                              <input
                                id="support-area"
                                type="text"
                                placeholder="Quận/Huyện hoặc địa bàn mong muốn..."
                                className={`w-full pl-12 pr-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant ${
                                  registerErrors.supportArea ? "border-error" : "border-neutral-200/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("supportArea")}
                              />
                            </div>
                            {registerErrors.supportArea && (
                              <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.supportArea.message}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedRole === "receiver" && (
                        <div className="space-y-4">
                          {/* Receiver Address */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="receiver-address">
                              Địa chỉ nhận hỗ trợ
                            </label>
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                                home
                              </span>
                              {/* Chỉ đọc: địa chỉ luôn lấy theo ghim trên bản đồ (reverse geocode)
                                  để chữ và toạ độ không lệch nhau — không cho gõ tay. */}
                              <input
                                id="receiver-address"
                                type="text"
                                readOnly
                                placeholder="Bấm nút định vị bên dưới hoặc ghim trên bản đồ"
                                className={`w-full pl-12 pr-4 py-3 bg-neutral-50 border-2 rounded-xl focus:ring-0 transition-all font-medium outline-none cursor-default placeholder:text-outline-variant ${
                                  registerErrors.receiverAddress ? "border-error" : "border-neutral-200/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("receiverAddress")}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => fillCurrentLocation("receiverAddress")}
                              disabled={isSubmitting || geoStatus === "locating"}
                              className="flex items-center gap-1.5 ml-1 mt-1 text-sm font-semibold text-emerald-800 hover:underline disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-base">
                                {geoStatus === "locating" ? "progress_activity" : "my_location"}
                              </span>
                              {geoStatus === "locating"
                                ? "Đang lấy vị trí..."
                                : geoStatus === "success" && geoCoords
                                  ? "Đã ghim vị trí — bấm để cập nhật"
                                  : "Dùng vị trí hiện tại của tôi"}
                            </button>
                            {geoCoords && (
                              <div className="mt-2 space-y-1">
                                <div className="h-48 w-full rounded-xl overflow-hidden border-2 border-neutral-200/30">
                                  <LocationPicker
                                    lng={geoCoords.lng}
                                    lat={geoCoords.lat}
                                    onPick={(lng, lat) => void handleMapPick("receiverAddress", lng, lat)}
                                  />
                                </div>
                                <p className="text-xs text-neutral-500 ml-1">
                                  Kéo ghim hoặc bấm trên bản đồ để chỉnh đúng vị trí của bạn.
                                </p>
                              </div>
                            )}
                            {registerErrors.receiverAddress && (
                              <p className="text-rose-600 text-sm ml-1 mt-2">{registerErrors.receiverAddress.message}</p>
                            )}
                          </div>

                          {/* Notes */}
                          <div className="space-y-1.5">
                            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="notes">
                              Hoàn cảnh / Ghi chú thêm (Tùy chọn)
                            </label>
                            <textarea
                              id="notes"
                              rows={3}
                              placeholder="Ví dụ: Sinh viên nghèo, người lao động tự do, v.v."
                              className="w-full px-4 py-3 bg-white border-2 border-neutral-200/30 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant resize-none"
                              disabled={isSubmitting}
                              {...registerSignup("notes")}
                            />
                          </div>
                        </div>
                      )}

                      {/* Navigation buttons */}
                      <div className="flex gap-4 pt-2">
                        <button
                          type="button"
                          onClick={() => setRegisterStep(1)}
                          className="flex-1 py-3 border-2 border-neutral-200/30 rounded-full font-bold text-neutral-800 hover:bg-neutral-100 transition-colors"
                        >
                          Quay lại
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-[2] squishy-button py-3 bg-emerald-800 text-white font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? (
                            <>
                              <span className="animate-spin border-2 border-primary border-t-transparent rounded-full w-5 h-5 mr-2"></span>
                              Đang đăng ký...
                            </>
                          ) : (
                            <>
                              Hoàn tất
                              <span className="material-symbols-outlined">check</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200/30"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#FAFBF9] px-3 text-neutral-500 font-medium">Hoặc tiếp tục với</span>
            </div>
          </div>

          {/* Social Logins — chỉ Google */}
          <div className="grid grid-cols-1 gap-4 items-center">
            {GOOGLE_ENABLED ? (
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={isSubmitting}
                className="squishy-button flex items-center justify-center gap-2 py-3 border-2 border-neutral-200/30 rounded-xl bg-white hover:bg-neutral-100 transition-colors disabled:opacity-60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                <span className="font-semibold text-base">Google</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toast.info('Đăng nhập Google chưa được cấu hình (cần NEXT_PUBLIC_FIREBASE_*).')}
                className="squishy-button flex items-center justify-center gap-2 py-3 border-2 border-neutral-200/30 rounded-xl bg-white hover:bg-neutral-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                <span className="font-semibold text-base">Google</span>
              </button>
            )}
          </div>

          {/* Footer Terms */}
          <p className="mt-8 text-center text-sm text-neutral-500 leading-relaxed px-4">
            Bằng cách đăng nhập, bạn đồng ý với{" "}
            <a className="text-emerald-800 font-bold hover:underline" href="#">
              Điều khoản dịch vụ
            </a>{" "}
            và{" "}
            <a className="text-emerald-800 font-bold hover:underline" href="#">
              Chính sách bảo mật
            </a>{" "}
            của FoodResQ.
          </p>
        </div>
      </section>

      {/* Mobile Footer */}
      <footer className="bg-white border-t border-neutral-200/20 py-8 md:hidden">
        <div className="flex flex-col items-center gap-6 px-6">
          <span className="font-medium text-secondary">© 2026 Chia Sẻ - Kết nối cộng đồng</span>
          <div className="flex gap-8">
            <a className="text-base text-neutral-500 hover:text-emerald-800" href="#">
              Liên hệ
            </a>
            <a className="text-base text-neutral-500 hover:text-emerald-800" href="#">
              Hướng dẫn
            </a>
          </div>
        </div>
      </footer>

      {/* eKYC BẮT BUỘC (người nhận cá nhân & tình nguyện viên): chụp khuôn mặt TRƯỚC —
          tài khoản chỉ được tạo khi BE xác thực được khuôn mặt trong cùng request đăng ký. */}
      {pendingFaceData && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-[#FAFBF9] rounded-t-2xl sm:rounded-3xl w-full sm:max-w-3xl shadow-12 flex flex-col gap-6 p-6 sm:p-10 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-[#96F28A] rounded-full flex items-center justify-center mb-6 shadow-sm">
                <span className="material-symbols-outlined text-green-900 font-bold text-3xl">verified_user</span>
              </div>
              <h2 className="font-bold text-[28px] text-neutral-800">
                Bước bắt buộc: Đăng ký khuôn mặt
              </h2>
              <p className="font-bold text-[15px] text-emerald-800 mt-2">
                Chụp khuôn mặt để hoàn tất đăng ký — chưa có tài khoản nào được tạo
              </p>
              <p className="text-[13px] text-neutral-500 mt-1 max-w-md">
                {pendingFaceData.role === 'volunteer'
                  ? 'Tình nguyện viên cần xác minh khuôn mặt để được giao nhiệm vụ.'
                  : 'Người nhận cần khuôn mặt gốc để đối chiếu khi nhận hàng.'}{' '}
                Không có khuôn mặt hợp lệ thì đăng ký sẽ thất bại.
              </p>
            </div>
            <div className="bg-white rounded-[24px] shadow-sm border border-neutral-100 p-6 sm:p-8 flex flex-col gap-6">
              <CameraCapture
                mode="face"
                hint="Chụp selfie rõ nét, đủ ánh sáng — đây sẽ là khuôn mặt gốc để đối chiếu khi nhận hàng"
                confirmLabel="Chụp & hoàn tất đăng ký"
                busy={isSubmitting}
                onConfirm={(photo) => void submitWithSelfie(photo)}
              />
              <div className="pt-1 flex justify-center">
                <button
                  onClick={() => {
                    setPendingFaceData(null);
                    toast.info('Đã huỷ đăng ký — tài khoản chưa được tạo.');
                  }}
                  disabled={isSubmitting}
                  className="text-neutral-500 font-semibold text-[13px] hover:text-neutral-800 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  Huỷ đăng ký <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
